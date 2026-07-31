/**
 * Tenant Admin Certification Test Suite — Phase 71
 *
 * Certifies TenantAdminService from @galaxy/platform-admin:
 * 1.  listAllTenants returns an array
 * 2.  listAllTenants includes the test org
 * 3.  listAllTenants filters by status='suspended'
 * 4.  listAllTenants respects limit
 * 5.  getTenant returns the org by id
 * 6.  getTenant returns null for non-existent id
 * 7.  suspendTenant sets status to 'suspended'
 * 8.  reinstateTenant sets status back to 'active'
 * 9.  getTenantUsageSummary returns a count map
 * 10. listAllTenants with status filter excludes orgs of other statuses
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { TenantAdminService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7101-4000-8000-710100000001';
const orgIdB = '00000000-7101-4000-8000-710100000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Tenant Admin Phase 71 Org A', 'tenantadmin-phase71-a', 'starter', 'active'),
            ($2, 'Tenant Admin Phase 71 Org B', 'tenantadmin-phase71-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Tenant Admin Certification', () => {
  // ── 1. listAllTenants returns array ──────────────────────────────────────
  it('1. listAllTenants returns an array of tenant summaries', async () => {
    const svc = new TenantAdminService(pool);
    const tenants = await svc.listAllTenants();
    expect(Array.isArray(tenants)).toBe(true);
    expect(tenants.length).toBeGreaterThan(0);
  });

  // ── 2. listAllTenants includes test org ───────────────────────────────────
  it('2. listAllTenants includes the test org', async () => {
    const svc = new TenantAdminService(pool);
    const tenants = await svc.listAllTenants();
    const found = tenants.find((t) => t.id === orgId);
    expect(found).toBeTruthy();
    expect(found?.status).toBe('active');
  });

  // ── 3. listAllTenants filters by status ───────────────────────────────────
  it('3. listAllTenants filters by status=suspended', async () => {
    const svc = new TenantAdminService(pool);
    await svc.suspendTenant(orgIdB);
    const suspended = await svc.listAllTenants({ status: 'suspended' });
    expect(suspended.every((t) => t.status === 'suspended')).toBe(true);
    const found = suspended.find((t) => t.id === orgIdB);
    expect(found).toBeTruthy();
    // reinstate for cleanup
    await svc.reinstateTenant(orgIdB);
  });

  // ── 4. listAllTenants respects limit ──────────────────────────────────────
  it('4. listAllTenants respects limit option', async () => {
    const svc = new TenantAdminService(pool);
    const tenants = await svc.listAllTenants({ limit: 1 });
    expect(tenants.length).toBeLessThanOrEqual(1);
  });

  // ── 5. getTenant returns the org ──────────────────────────────────────────
  it('5. getTenant returns the org by id', async () => {
    const svc = new TenantAdminService(pool);
    const tenant = await svc.getTenant(orgId);
    expect(tenant).toBeTruthy();
    expect(tenant?.id).toBe(orgId);
    expect(tenant?.name).toContain('Phase 71');
  });

  // ── 6. getTenant returns null for non-existent ───────────────────────────
  it('6. getTenant returns null for a non-existent id', async () => {
    const svc = new TenantAdminService(pool);
    const tenant = await svc.getTenant('00000000-0000-0000-0000-000000000000');
    expect(tenant).toBeNull();
  });

  // ── 7. suspendTenant sets status=suspended ────────────────────────────────
  it('7. suspendTenant sets status to suspended', async () => {
    const svc = new TenantAdminService(pool);
    const result = await svc.suspendTenant(orgId);
    expect(result).toBeTruthy();
    expect(result?.status).toBe('suspended');
  });

  // ── 8. reinstateTenant restores status=active ─────────────────────────────
  it('8. reinstateTenant sets status back to active', async () => {
    const svc = new TenantAdminService(pool);
    const result = await svc.reinstateTenant(orgId);
    expect(result).toBeTruthy();
    expect(result?.status).toBe('active');
  });

  // ── 9. getTenantUsageSummary returns counts ───────────────────────────────
  it('9. getTenantUsageSummary returns a count map with expected keys', async () => {
    const svc = new TenantAdminService(pool);
    const summary = await svc.getTenantUsageSummary(orgId);
    expect(summary).toBeTruthy();
    expect(typeof summary.members).toBe('number');
    expect(typeof summary.workflows).toBe('number');
    expect(typeof summary.agents).toBe('number');
    expect(typeof summary.events).toBe('number');
  });

  // ── 10. Cross-status isolation ────────────────────────────────────────────
  it('10. listAllTenants filtered by active excludes suspended tenants', async () => {
    const svc = new TenantAdminService(pool);
    await svc.suspendTenant(orgIdB);
    const active = await svc.listAllTenants({ status: 'active' });
    expect(active.every((t) => t.status === 'active')).toBe(true);
    expect(active.some((t) => t.id === orgIdB)).toBe(false);
    await svc.reinstateTenant(orgIdB);
  });
});
