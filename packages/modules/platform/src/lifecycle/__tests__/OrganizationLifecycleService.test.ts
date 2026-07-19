import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrganizationLifecycleService } from '../OrganizationLifecycleService.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const eventRow = {
  id: 'evt-1',
  organization_id: 'org-1',
  event_type: 'activated',
  metadata: {},
  occurred_at: '2024-01-01T00:00:00Z',
};

const checkpointRow = {
  id: 'chk-1',
  organization_id: 'org-1',
  checkpoint_type: 'data_import',
  passed: true,
  notes: null,
  checked_at: '2024-01-01T00:00:00Z',
};

describe('OrganizationLifecycleService', () => {
  describe('recordEvent', () => {
    it('sets tenant context and returns event', async () => {
      const pool = makePool([ok([]), ok([eventRow])]);
      const svc = new OrganizationLifecycleService(pool);
      const result = await svc.recordEvent({ organizationId: 'org-1', eventType: 'activated' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('evt-1');
      expect(result.eventType).toBe('activated');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrganizationLifecycleService(pool);
      await expect(
        svc.recordEvent({ organizationId: 'org-1', eventType: 'activated' }),
      ).rejects.toThrow('Failed to record lifecycle event');
    });
  });

  describe('listEvents', () => {
    it('sets tenant context and returns events', async () => {
      const pool = makePool([ok([]), ok([eventRow])]);
      const svc = new OrganizationLifecycleService(pool);
      const result = await svc.listEvents('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.eventType).toBe('activated');
    });

    it('returns empty array when no events', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrganizationLifecycleService(pool);
      const result = await svc.listEvents('org-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('recordHealthCheckpoint', () => {
    it('sets tenant context and returns checkpoint', async () => {
      const pool = makePool([ok([]), ok([checkpointRow])]);
      const svc = new OrganizationLifecycleService(pool);
      const result = await svc.recordHealthCheckpoint({
        organizationId: 'org-1',
        checkpointType: 'data_import',
        passed: true,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('chk-1');
      expect(result.passed).toBe(true);
      expect(result.notes).toBeNull();
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrganizationLifecycleService(pool);
      await expect(
        svc.recordHealthCheckpoint({
          organizationId: 'org-1',
          checkpointType: 'x',
          passed: false,
        }),
      ).rejects.toThrow('Failed to record health checkpoint');
    });
  });
});
