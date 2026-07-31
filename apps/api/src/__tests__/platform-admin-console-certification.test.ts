/**
 * Platform Admin Console Certification Test Suite — Phase 69
 *
 * Certifies PlatformAdminService and PlatformDashboardService:
 * 1.  getOrgDirectory returns an array of org summaries
 * 2.  getOrgDirectory includes the test org
 * 3.  getOrgDirectory filters by status
 * 4.  getOrgDirectory respects limit
 * 5.  getPlatformHealthSummary returns health data
 * 6.  getPlatformHealthSummary has totalOrgs >= 1
 * 7.  getPlatformHealthSummary has healthScore in [0, 100]
 * 8.  getAggregateMetrics returns dashboard metrics
 * 9.  getAggregateMetrics metrics array contains known keys
 * 10. Cross-tenant: getUserDirectory filters by organizationId
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PlatformAdminService, PlatformDashboardService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6901-4000-8000-690000000001';
const orgIdB = '00000000-6901-4000-8000-690000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Admin Console Phase 69 Org A', 'admin-phase69-a', 'starter', 'active'),
            ($2, 'Admin Console Phase 69 Org B', 'admin-phase69-b', 'starter', 'suspended')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
  // Insert a member for orgIdB so getUserDirectory filter is testable
  await pool
    .query(
      `INSERT INTO members (id, organization_id, email, role)
     VALUES (gen_random_uuid(), $1, 'phase69-b@cert.test', 'member')
     ON CONFLICT DO NOTHING`,
      [orgIdB],
    )
    .catch(() => null);
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM members WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Admin Console Certification', () => {
  // ── 1. getOrgDirectory returns array ─────────────────────────────────────
  it('1. getOrgDirectory returns an array of org summaries', async () => {
    const svc = new PlatformAdminService(pool);
    const orgs = await svc.getOrgDirectory();
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.length).toBeGreaterThan(0);
  });

  // ── 2. getOrgDirectory includes test org ─────────────────────────────────
  it('2. getOrgDirectory includes the test org', async () => {
    const svc = new PlatformAdminService(pool);
    const orgs = await svc.getOrgDirectory();
    const found = orgs.find((o) => o.id === orgId);
    expect(found).toBeTruthy();
    expect(found?.status).toBe('active');
  });

  // ── 3. getOrgDirectory filters by status ─────────────────────────────────
  it('3. getOrgDirectory filters by status', async () => {
    const svc = new PlatformAdminService(pool);
    const suspended = await svc.getOrgDirectory({ status: 'suspended' });
    expect(suspended.every((o) => o.status === 'suspended')).toBe(true);
    const found = suspended.find((o) => o.id === orgIdB);
    expect(found).toBeTruthy();
  });

  // ── 4. getOrgDirectory respects limit ────────────────────────────────────
  it('4. getOrgDirectory respects limit', async () => {
    const svc = new PlatformAdminService(pool);
    const orgs = await svc.getOrgDirectory({ limit: 1 });
    expect(orgs.length).toBeLessThanOrEqual(1);
  });

  // ── 5. getPlatformHealthSummary returns health data ───────────────────────
  it('5. getPlatformHealthSummary returns health data', async () => {
    const svc = new PlatformAdminService(pool);
    const summary = await svc.getPlatformHealthSummary();
    expect(summary).toBeTruthy();
    expect(summary.measuredAt).toBeTruthy();
  });

  // ── 6. getPlatformHealthSummary totalOrgs >= 1 ───────────────────────────
  it('6. getPlatformHealthSummary has totalOrgs >= 1', async () => {
    const svc = new PlatformAdminService(pool);
    const summary = await svc.getPlatformHealthSummary();
    expect(summary.totalOrgs).toBeGreaterThanOrEqual(1);
  });

  // ── 7. getPlatformHealthSummary healthScore in [0, 100] ──────────────────
  it('7. getPlatformHealthSummary has healthScore in [0, 100]', async () => {
    const svc = new PlatformAdminService(pool);
    const summary = await svc.getPlatformHealthSummary();
    expect(summary.healthScore).toBeGreaterThanOrEqual(0);
    expect(summary.healthScore).toBeLessThanOrEqual(100);
  });

  // ── 8. getAggregateMetrics returns dashboard metrics ─────────────────────
  it('8. getAggregateMetrics returns dashboard metrics', async () => {
    const svc = new PlatformDashboardService(pool);
    const metrics = await svc.getAggregateMetrics();
    expect(metrics).toBeTruthy();
    expect(metrics.generatedAt).toBeTruthy();
    expect(metrics.totalOrgs).toBeGreaterThanOrEqual(1);
  });

  // ── 9. getAggregateMetrics metrics array has known keys ──────────────────
  it('9. getAggregateMetrics metrics array contains known keys', async () => {
    const svc = new PlatformDashboardService(pool);
    const metrics = await svc.getAggregateMetrics();
    expect(Array.isArray(metrics.metrics)).toBe(true);
    const keys = metrics.metrics.map((m) => m.key);
    expect(keys).toContain('total_orgs');
    expect(keys).toContain('active_tenants');
  });

  // ── 10. Cross-tenant: getUserDirectory filters by org ────────────────────
  it('10. getUserDirectory filters by organizationId — cross-tenant isolation', async () => {
    const svc = new PlatformAdminService(pool);
    const usersA = await svc.getUserDirectory({ organizationId: orgId });
    const usersB = await svc.getUserDirectory({ organizationId: orgIdB });
    expect(usersA.every((u) => u.organizationId === orgId)).toBe(true);
    expect(usersB.every((u) => u.organizationId === orgIdB)).toBe(true);
    expect(usersA.some((u) => u.organizationId === orgIdB)).toBe(false);
  });
});
