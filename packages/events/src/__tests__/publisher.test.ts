import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { EventPublisher } from '../publisher.js';
import type { GalaxyEvent } from '@galaxy/types';

function makePool(): Pool {
  const query = vi
    .fn()
    .mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] });
  return { query } as unknown as Pool;
}

function makeEvent(overrides: Partial<GalaxyEvent> = {}): GalaxyEvent {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    version: '1.0',
    type: 'organization.created',
    tenantId: '00000000-0000-0000-0000-000000000002',
    correlationId: '00000000-0000-0000-0000-000000000003',
    causationId: '00000000-0000-0000-0000-000000000003',
    timestamp: new Date().toISOString(),
    actor: { type: 'system', id: 'system' },
    payload: { organizationId: '00000000-0000-0000-0000-000000000002' },
    metadata: {
      idempotencyKey: '00000000-0000-0000-0000-000000000004',
      schemaVersion: '1.0',
      source: 'galaxy-api',
    },
    ...overrides,
  };
}

describe('EventPublisher', () => {
  let pool: Pool;
  let publisher: EventPublisher;

  beforeEach(() => {
    pool = makePool();
    publisher = new EventPublisher(pool);
  });

  describe('publish', () => {
    it('sets tenant context before inserting', async () => {
      const event = makeEvent();
      await publisher.publish(event);

      const mockQuery = vi.mocked(pool.query);
      const firstCall = mockQuery.mock.calls[0] as [string, string[]];
      expect(firstCall[0]).toContain('set_config');
      expect(firstCall[1]).toContain('app.current_tenant');
      expect(firstCall[1]).toContain(event.tenantId);
    });

    it('returns success with event id', async () => {
      const event = makeEvent();
      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe(event.id);
    });

    it('returns failure for invalid event', async () => {
      const invalidEvent: GalaxyEvent = { ...makeEvent(), id: 'not-a-uuid' };
      const result = await publisher.publish(invalidEvent);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('inserts event with parameterized query', async () => {
      const event = makeEvent();
      await publisher.publish(event);

      const mockQuery = vi.mocked(pool.query);
      const insertCall = mockQuery.mock.calls[1] as [string, unknown[]];
      expect(insertCall[0]).toContain('INSERT INTO events');
      expect(insertCall[0]).toContain('$1');
      expect(insertCall[1]).toContain(event.id);
    });
  });
});
