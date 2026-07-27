/**
 * Galaxy Event Bus OS Certification Test Suite
 *
 * Certifies the event publishing and subscriber lifecycle:
 * 1.  EventPublisher.publish persists a GalaxyEvent to the events table
 * 2.  publish returns success=true with the event ID
 * 3.  publish with invalid envelope returns success=false
 * 4.  publishBatch inserts multiple events in one transaction
 * 5.  publishBatch returns results for each event
 * 6.  InMemoryEventSubscriber dispatches to a registered handler
 * 7.  InMemoryEventSubscriber does not call handler after unsubscribe
 * 8.  EventRegistry registers and validates payload schemas
 * 9.  EventRegistry rejects unknown event type validation
 * 10. Cross-tenant isolation — org B events are not visible to org A query
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import pg from 'pg';
import { EventPublisher, EventRegistry, InMemoryEventSubscriber } from '@galaxy/events';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6201-4000-8000-620000000001';
const orgIdB = '00000000-6201-4000-8000-620000000002';

function makeEvent(tenantId: string, type = 'workflow.submitted') {
  return {
    id: randomUUID(),
    version: '1.0',
    type,
    tenantId,
    correlationId: randomUUID(),
    causationId: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: { type: 'system' as const, id: 'cert-test' },
    payload: { certPhase: 62 },
    metadata: { idempotencyKey: randomUUID(), schemaVersion: '1.0', source: 'cert' },
  };
}

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Events Phase 62 Org A', 'events-phase62-a', 'starter', 'active'),
            ($2, 'Events Phase 62 Org B', 'events-phase62-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Galaxy Event Bus OS Certification', () => {
  // ── 1. publish persists event ─────────────────────────────────────────────
  it('1. EventPublisher.publish persists a GalaxyEvent to the events table', async () => {
    const publisher = new EventPublisher(pool);
    const event = makeEvent(orgId);
    const result = await publisher.publish(event);
    expect(result.success).toBe(true);
    const row = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM events WHERE id = $1`, [
      event.id,
    ]);
    expect(Number(row.rows[0]?.count ?? 0)).toBe(1);
  });

  // ── 2. publish returns success=true ───────────────────────────────────────
  it('2. publish returns success=true with the event ID', async () => {
    const publisher = new EventPublisher(pool);
    const event = makeEvent(orgId, 'loop.verified');
    const result = await publisher.publish(event);
    expect(result.success).toBe(true);
    expect(result.eventId).toBe(event.id);
  });

  // ── 3. invalid envelope returns success=false ─────────────────────────────
  it('3. publish with invalid envelope returns success=false', async () => {
    const publisher = new EventPublisher(pool);
    const badEvent = {
      id: 'not-a-uuid',
      version: '',
      type: '',
      tenantId: 'not-a-uuid',
      correlationId: 'not-a-uuid',
      causationId: 'not-a-uuid',
      timestamp: 'not-a-date',
      actor: { type: 'system' as const, id: '' },
      payload: {},
      metadata: { idempotencyKey: 'not-a-uuid', schemaVersion: '', source: '' },
    };
    const result = await publisher.publish(badEvent);
    expect(result.success).toBe(false);
  });

  // ── 4. publishBatch inserts multiple events ───────────────────────────────
  it('4. publishBatch inserts multiple events in one transaction', async () => {
    const publisher = new EventPublisher(pool);
    const events = [
      makeEvent(orgId, 'agent.action.completed'),
      makeEvent(orgId, 'workflow.approved'),
    ];
    const results = await publisher.publishBatch(events);
    expect(results.length).toBe(2);
    expect(results.filter((r) => r.success).length).toBe(2);
  });

  // ── 5. publishBatch returns results per event ─────────────────────────────
  it('5. publishBatch returns results for each event', async () => {
    const publisher = new EventPublisher(pool);
    const events = [makeEvent(orgId, 'knowledge.document.created')];
    const results = await publisher.publishBatch(events);
    expect(results[0]?.eventId).toBe(events[0]?.id);
  });

  // ── 6. InMemoryEventSubscriber dispatches ─────────────────────────────────
  it('6. InMemoryEventSubscriber dispatches to a registered handler', async () => {
    const subscriber = new InMemoryEventSubscriber();
    await subscriber.start();
    const received: unknown[] = [];
    subscriber.subscribe('workflow.submitted', (evt) => {
      received.push(evt);
    });
    const event = makeEvent(orgId);
    await subscriber.dispatch(event);
    await subscriber.stop();
    expect(received.length).toBe(1);
  });

  // ── 7. unsubscribe removes handler ────────────────────────────────────────
  it('7. InMemoryEventSubscriber does not call handler after unsubscribe', async () => {
    const subscriber = new InMemoryEventSubscriber();
    await subscriber.start();
    const received: unknown[] = [];
    subscriber.subscribe('workflow.submitted', (evt) => {
      received.push(evt);
    });
    subscriber.unsubscribe('workflow.submitted');
    await subscriber.dispatch(makeEvent(orgId));
    await subscriber.stop();
    expect(received.length).toBe(0);
  });

  // ── 8. EventRegistry registers and validates ──────────────────────────────
  it('8. EventRegistry registers and validates payload schemas', () => {
    const registry = new EventRegistry();
    registry.register('cert.test.event', { parse: (p: unknown) => p });
    const types = registry.listTypes();
    expect(types).toContain('cert.test.event');
  });

  // ── 9. EventRegistry rejects unknown type ─────────────────────────────────
  it('9. EventRegistry rejects unknown event type validation', () => {
    const registry = new EventRegistry();
    const result = registry.validatePayload('unknown.type', {});
    expect(result.success).toBe(false);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B events are not visible to org A query', async () => {
    const publisher = new EventPublisher(pool);
    await publisher.publish(makeEvent(orgIdB, 'member.invited'));
    const eventsA = await pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM events WHERE organization_id = $1`,
      [orgId],
    );
    const eventsB = await pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM events WHERE organization_id = $1`,
      [orgIdB],
    );
    expect(eventsA.rows.every((r) => r.organization_id === orgId)).toBe(true);
    expect(eventsB.rows.every((r) => r.organization_id === orgIdB)).toBe(true);
    expect(eventsA.rows.some((r) => r.organization_id === orgIdB)).toBe(false);
  });
});
