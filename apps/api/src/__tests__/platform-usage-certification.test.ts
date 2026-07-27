/**
 * Platform Usage OS Certification Test Suite
 *
 * Certifies usage metering, quota, revenue operations, and customer health:
 * 1.  recordEvent persists a usage event
 * 2.  queryEvents returns events for the org
 * 3.  checkQuota returns allowed=true with limit=-1 when no limit is set
 * 4.  setLimit persists a quota limit
 * 5.  checkQuota returns allowed=true when usage is below limit
 * 6.  createAlert persists a usage alert
 * 7.  recordSnapshot persists a revenue snapshot
 * 8.  listSnapshots returns the recorded snapshot
 * 9.  calculateHealthScore returns 10 for a fresh org (no activity, no subscription)
 * 10. Cross-tenant isolation — org B usage events are separate from org A
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  UsageMeteringService,
  QuotaService,
  RevenueOperationsService,
  CustomerHealthService,
} from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-5501-4000-8000-550000000001';
const orgIdB = '00000000-5501-4000-8000-550000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Usage Test Org A', 'usage-test-a', 'starter', 'active'),
            ($2, 'Usage Test Org B', 'usage-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM usage_alerts WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM usage_limits WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM usage_records WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM usage_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.query(`DELETE FROM revenue_snapshots`).catch(() => null);
  await pool
    .query(`DELETE FROM customer_health_scores WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Usage OS Certification', () => {
  // ── 1. recordEvent persists a usage event ────────────────────────────────
  it('1. recordEvent persists a usage event', async () => {
    const svc = new UsageMeteringService(pool);
    const event = await svc.recordEvent({
      organizationId: orgId,
      resourceType: 'api_calls',
      quantity: 10,
    });
    expect(event).toBeTruthy();
    expect(event.organizationId).toBe(orgId);
    expect(event.resourceType).toBe('api_calls');
    expect(event.quantity).toBe(10);
  });

  // ── 2. queryEvents returns events for the org ─────────────────────────────
  it('2. queryEvents returns events for the org', async () => {
    const svc = new UsageMeteringService(pool);
    const events = await svc.queryEvents({ organizationId: orgId });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.organizationId === orgId)).toBe(true);
  });

  // ── 3. checkQuota returns allowed=true with limit=-1 when no limit set ────
  it('3. checkQuota returns allowed=true with limit=-1 when no limit is set', async () => {
    const svc = new QuotaService(pool);
    const result = await svc.checkQuota(orgId, 'messages');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });

  // ── 4. setLimit persists a quota limit ───────────────────────────────────
  it('4. setLimit persists a quota limit', async () => {
    const svc = new QuotaService(pool);
    const limit = await svc.setLimit({
      organizationId: orgId,
      resourceType: 'api_calls',
      limitValue: 1000,
    });
    expect(limit).toBeTruthy();
    expect(limit.resourceType).toBe('api_calls');
    expect(limit.limitValue).toBe(1000);
  });

  // ── 5. checkQuota allowed=true when below limit ───────────────────────────
  it('5. checkQuota returns allowed=true when usage is below limit', async () => {
    const svc = new QuotaService(pool);
    const result = await svc.checkQuota(orgId, 'api_calls');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(1000);
    expect(result.current).toBeGreaterThanOrEqual(0);
  });

  // ── 6. createAlert persists a usage alert ────────────────────────────────
  it('6. createAlert persists a usage alert', async () => {
    const svc = new QuotaService(pool);
    const alert = await svc.createAlert({
      organizationId: orgId,
      resourceType: 'api_calls',
      thresholdPct: 80,
    });
    expect(alert).toBeTruthy();
    expect(alert.organizationId).toBe(orgId);
    expect(alert.resourceType).toBe('api_calls');
  });

  // ── 7. recordSnapshot persists a revenue snapshot ─────────────────────────
  it('7. recordSnapshot persists a revenue snapshot', async () => {
    const svc = new RevenueOperationsService(pool);
    const snap = await svc.recordSnapshot({
      mrrCents: 100000,
      arrCents: 1200000,
      activeSubscriptions: 5,
      churnedThisMonth: 0,
      newThisMonth: 2,
    });
    expect(snap).toBeTruthy();
    expect(snap.mrrCents).toBe(100000);
    expect(snap.arrCents).toBe(1200000);
    expect(snap.activeSubscriptions).toBe(5);
  });

  // ── 8. listSnapshots returns the recorded snapshot ────────────────────────
  it('8. listSnapshots returns the recorded snapshot', async () => {
    const svc = new RevenueOperationsService(pool);
    const snapshots = await svc.listSnapshots({ limit: 10 });
    expect(snapshots.length).toBeGreaterThan(0);
    expect(typeof snapshots[0].mrrCents).toBe('number');
  });

  // ── 9. calculateHealthScore = 10 for fresh org ───────────────────────────
  it('9. calculateHealthScore returns 10 for a fresh org', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.calculateHealthScore(orgIdB);
    expect(score.score).toBe(10);
    expect(score.organizationId).toBe(orgIdB);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B usage events are separate from org A', async () => {
    const svc = new UsageMeteringService(pool);
    await svc.recordEvent({ organizationId: orgIdB, resourceType: 'messages', quantity: 5 });
    const eventsA = await svc.queryEvents({ organizationId: orgId });
    const eventsB = await svc.queryEvents({ organizationId: orgIdB });
    expect(eventsA.every((e) => e.organizationId === orgId)).toBe(true);
    expect(eventsB.every((e) => e.organizationId === orgIdB)).toBe(true);
    expect(eventsA.some((e) => e.organizationId === orgIdB)).toBe(false);
  });
});
