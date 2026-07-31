/**
 * Usage Metering Service Certification Test Suite — Phase 80
 *
 * Certifies UsageMeteringService from @galaxy/platform:
 * 1.  recordEvent creates a usage event
 * 2.  recorded event has correct organizationId and resourceType
 * 3.  queryEvents returns events for the org
 * 4.  queryEvents filters by resourceType
 * 5.  queryEvents filters by since date
 * 6.  queryEvents respects limit
 * 7.  queryEvents returns empty for no matching resourceType
 * 8.  getUsageRecords returns records for the org (empty initially is fine)
 * 9.  multiple events — queryEvents returns all for org
 * 10. Cross-org: orgB events not returned in orgA queryEvents
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { UsageMeteringService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8001-4000-8000-800100000001';
const orgIdB = '00000000-8001-4000-8000-800100000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Usage Metering Phase 80 Org A', 'usagemetering-phase80-a', 'starter', 'active'),
            ($2, 'Usage Metering Phase 80 Org B', 'usagemetering-phase80-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM usage_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Usage Metering Service Certification', () => {
  // ── 1. recordEvent creates a usage event ─────────────────────────────────
  it('1. recordEvent creates a usage event', async () => {
    const svc = new UsageMeteringService(pool);
    const event = await svc.recordEvent({
      organizationId: orgId,
      resourceType: 'api_call',
      quantity: 1,
      metadata: { endpoint: '/test' },
    });
    expect(event).toBeTruthy();
    expect(event.id).toBeTruthy();
  });

  // ── 2. recorded event has correct org and resourceType ────────────────────
  it('2. recorded event has correct organizationId and resourceType', async () => {
    const svc = new UsageMeteringService(pool);
    const event = await svc.recordEvent({
      organizationId: orgId,
      resourceType: 'storage_mb',
      quantity: 10,
    });
    expect(event.organizationId).toBe(orgId);
    expect(event.resourceType).toBe('storage_mb');
    expect(event.quantity).toBe(10);
  });

  // ── 3. queryEvents returns events for org ────────────────────────────────
  it('3. queryEvents returns events for the org', async () => {
    const svc = new UsageMeteringService(pool);
    const events = await svc.queryEvents({ organizationId: orgId });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.organizationId === orgId)).toBe(true);
  });

  // ── 4. queryEvents filters by resourceType ───────────────────────────────
  it('4. queryEvents filters by resourceType', async () => {
    const svc = new UsageMeteringService(pool);
    const events = await svc.queryEvents({ organizationId: orgId, resourceType: 'api_call' });
    expect(events.every((e) => e.resourceType === 'api_call')).toBe(true);
  });

  // ── 5. queryEvents filters by since ──────────────────────────────────────
  it('5. queryEvents filters by since date', async () => {
    const svc = new UsageMeteringService(pool);
    const futureDate = new Date(Date.now() + 60000);
    const events = await svc.queryEvents({ organizationId: orgId, since: futureDate });
    expect(events.length).toBe(0);
  });

  // ── 6. queryEvents respects limit ────────────────────────────────────────
  it('6. queryEvents respects limit', async () => {
    const svc = new UsageMeteringService(pool);
    const events = await svc.queryEvents({ organizationId: orgId, limit: 1 });
    expect(events.length).toBeLessThanOrEqual(1);
  });

  // ── 7. queryEvents empty for no matching resourceType ────────────────────
  it('7. queryEvents returns empty for non-existent resourceType', async () => {
    const svc = new UsageMeteringService(pool);
    const events = await svc.queryEvents({
      organizationId: orgId,
      resourceType: 'cert80.nonexistent.resource',
    });
    expect(events.length).toBe(0);
  });

  // ── 8. getUsageRecords returns array ────────────────────────────────────
  it('8. getUsageRecords returns an array for the org', async () => {
    const svc = new UsageMeteringService(pool);
    const records = await svc.getUsageRecords(orgId);
    expect(Array.isArray(records)).toBe(true);
  });

  // ── 9. multiple events in queryEvents ────────────────────────────────────
  it('9. multiple events are returned for the org', async () => {
    const svc = new UsageMeteringService(pool);
    await svc.recordEvent({ organizationId: orgId, resourceType: 'message', quantity: 5 });
    await svc.recordEvent({ organizationId: orgId, resourceType: 'message', quantity: 3 });
    const events = await svc.queryEvents({ organizationId: orgId, resourceType: 'message' });
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  // ── 10. Cross-org: orgB events not in orgA results ───────────────────────
  it('10. orgB events are not returned in orgA queryEvents', async () => {
    const svc = new UsageMeteringService(pool);
    await svc.recordEvent({ organizationId: orgIdB, resourceType: 'api_call', quantity: 99 });
    const eventsA = await svc.queryEvents({ organizationId: orgId });
    const eventsB = await svc.queryEvents({ organizationId: orgIdB });
    expect(eventsA.every((e) => e.organizationId === orgId)).toBe(true);
    expect(eventsB.every((e) => e.organizationId === orgIdB)).toBe(true);
    expect(eventsA.some((e) => e.organizationId === orgIdB)).toBe(false);
  });
});
