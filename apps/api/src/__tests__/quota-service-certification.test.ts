/**
 * Quota Service Certification Test Suite — Phase 81
 *
 * Certifies QuotaService from @galaxy/platform:
 * 1.  setLimit creates a usage limit
 * 2.  setLimit result has correct resourceType and limitValue
 * 3.  getLimits returns limits for the org
 * 4.  setLimit upserts on conflict
 * 5.  checkQuota returns a QuotaCheckResult
 * 6.  checkQuota allowed=true when under limit
 * 7.  setAlert creates a usage alert
 * 8.  getAlerts returns alerts for the org
 * 9.  setAlert returns correct threshold
 * 10. Cross-org: limits for orgB do not appear in orgA getLimits
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { QuotaService, type UsageAlert, type QuotaCheckResult } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8101-4000-8000-810100000001';
const orgIdB = '00000000-8101-4000-8000-810100000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Quota Phase 81 Org A', 'quota-phase81-a', 'starter', 'active'),
            ($2, 'Quota Phase 81 Org B', 'quota-phase81-b', 'starter', 'active')
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
    .query(`DELETE FROM usage_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Quota Service Certification', () => {
  // ── 1. setLimit creates a limit ───────────────────────────────────────────
  it('1. setLimit creates a usage limit', async () => {
    const svc = new QuotaService(pool);
    const limit = await svc.setLimit({
      organizationId: orgId,
      resourceType: 'api_calls',
      limitValue: 10000,
      resetPeriod: 'monthly',
    });
    expect(limit).toBeTruthy();
    expect(limit.id).toBeTruthy();
  });

  // ── 2. setLimit result has correct fields ────────────────────────────────
  it('2. setLimit result has correct resourceType and limitValue', async () => {
    const svc = new QuotaService(pool);
    const limit = await svc.setLimit({
      organizationId: orgId,
      resourceType: 'storage_mb',
      limitValue: 512,
    });
    expect(limit.resourceType).toBe('storage_mb');
    expect(limit.limitValue).toBe(512);
    expect(limit.organizationId).toBe(orgId);
  });

  // ── 3. getLimits returns limits for org ──────────────────────────────────
  it('3. getLimits returns limits for the org', async () => {
    const svc = new QuotaService(pool);
    const limits = await svc.getLimits(orgId);
    expect(Array.isArray(limits)).toBe(true);
    expect(limits.length).toBeGreaterThanOrEqual(2);
    expect(limits.every((l) => l.organizationId === orgId)).toBe(true);
  });

  // ── 4. setLimit upserts on conflict ──────────────────────────────────────
  it('4. setLimit updates limitValue on upsert', async () => {
    const svc = new QuotaService(pool);
    const updated = await svc.setLimit({
      organizationId: orgId,
      resourceType: 'api_calls',
      limitValue: 50000,
    });
    expect(updated.limitValue).toBe(50000);
  });

  // ── 5. checkQuota returns a QuotaCheckResult ─────────────────────────────
  it('5. checkQuota returns a QuotaCheckResult object', async () => {
    const svc = new QuotaService(pool);
    const result: QuotaCheckResult = await svc.checkQuota(orgId, 'api_calls');
    expect(result).toBeTruthy();
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.current).toBe('number');
    expect(typeof result.limit).toBe('number');
    expect(typeof result.percentUsed).toBe('number');
  });

  // ── 6. checkQuota allowed=true when under limit ───────────────────────────
  it('6. checkQuota allowed=true when current usage is under limit', async () => {
    const svc = new QuotaService(pool);
    const result: QuotaCheckResult = await svc.checkQuota(orgId, 'api_calls');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(50000);
  });

  // ── 7. setAlert creates an alert ────────────────────────────────────────
  it('7. setAlert creates a usage alert', async () => {
    const svc = new QuotaService(pool);
    const alert: UsageAlert = await svc.setAlert({
      organizationId: orgId,
      resourceType: 'api_calls',
      thresholdPct: 80,
    });
    expect(alert).toBeTruthy();
    expect(alert.id).toBeTruthy();
  });

  // ── 8. getAlerts returns alerts for org ──────────────────────────────────
  it('8. getAlerts returns alerts for the org', async () => {
    const svc = new QuotaService(pool);
    const alerts: UsageAlert[] = await svc.getAlerts(orgId);
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.organizationId === orgId)).toBe(true);
  });

  // ── 9. setAlert has correct threshold ───────────────────────────────────
  it('9. setAlert result has correct thresholdPct', async () => {
    const svc = new QuotaService(pool);
    const alert: UsageAlert = await svc.setAlert({
      organizationId: orgId,
      resourceType: 'storage_mb',
      thresholdPct: 90,
    });
    expect(alert.thresholdPct).toBe(90);
    expect(alert.resourceType).toBe('storage_mb');
  });

  // ── 10. Cross-org: orgB limits don't appear in orgA getLimits ────────────
  it('10. limits for orgB do not appear in orgA getLimits', async () => {
    const svc = new QuotaService(pool);
    await svc.setLimit({ organizationId: orgIdB, resourceType: 'api_calls', limitValue: 1000 });
    const limitsA = await svc.getLimits(orgId);
    const limitsB = await svc.getLimits(orgIdB);
    expect(limitsA.every((l) => l.organizationId === orgId)).toBe(true);
    expect(limitsB.every((l) => l.organizationId === orgIdB)).toBe(true);
    expect(limitsA.some((l) => l.organizationId === orgIdB)).toBe(false);
  });
});
