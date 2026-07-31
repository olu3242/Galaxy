/**
 * Tenant Operations Service Certification Test Suite — Phase 77
 *
 * Certifies TenantOperationsService from @galaxy/platform-admin:
 * 1.  createTenant creates a new tenant record
 * 2.  created tenant has correct name and plan
 * 3.  getTenant returns the tenant by id
 * 4.  getTenant returns null for non-existent id
 * 5.  created tenant has limits object with numeric fields
 * 6.  suspendTenant sets status to 'suspended'
 * 7.  reactivateTenant sets status back to 'active'
 * 8.  archiveTenant is not used in test (status 'archived' not in org check — skipped via deleteTenant)
 * 8.  getTenant returns the reactivated tenant with active status
 * 9.  tenant limits are written to org_tenant_limits table
 * 10. Cross-scope: two tenants have separate records
 */

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { TenantOperationsService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    await pool
      .query(`DELETE FROM org_tenant_limits WHERE organization_id = $1`, [id])
      .catch(() => null);
    await pool
      .query(`DELETE FROM tenant_lifecycle WHERE organization_id = $1`, [id])
      .catch(() => null);
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [id]).catch(() => null);
  }
  await pool.end();
});

describe('Tenant Operations Service Certification', () => {
  let tenantId: string;
  let tenantBId: string;

  // ── 1. createTenant creates a tenant ─────────────────────────────────────
  it('1. createTenant creates a new tenant record', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.createTenant({
      name: 'Cert77 Tenant A',
      slug: `cert77-tenant-a-${String(Date.now())}`,
      plan: 'starter',
      adminEmail: 'cert77-admin@test.com',
    });
    expect(tenant).toBeTruthy();
    expect(tenant.id).toBeTruthy();
    tenantId = tenant.id;
    createdIds.push(tenantId);
  });

  // ── 2. created tenant has correct name and plan ───────────────────────────
  it('2. created tenant has correct name and plan', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.createTenant({
      name: 'Cert77 Tenant Check',
      slug: `cert77-tenant-check-${String(Date.now())}`,
      plan: 'growth',
      adminEmail: 'cert77-check@test.com',
    });
    expect(tenant.name).toBe('Cert77 Tenant Check');
    expect(tenant.plan).toBe('growth');
    createdIds.push(tenant.id);
  });

  // ── 3. getTenant returns the tenant ───────────────────────────────────────
  it('3. getTenant returns the tenant by id', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.getTenant(tenantId);
    expect(tenant).toBeTruthy();
    expect(tenant?.id).toBe(tenantId);
    expect(tenant?.name).toBe('Cert77 Tenant A');
  });

  // ── 4. getTenant returns null for non-existent ────────────────────────────
  it('4. getTenant returns null for a non-existent id', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.getTenant('00000000-0000-0000-0000-000000000000');
    expect(tenant).toBeNull();
  });

  // ── 5. limits has numeric fields ──────────────────────────────────────────
  it('5. created tenant has limits with numeric maxMembers', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.getTenant(tenantId);
    expect(tenant?.limits).toBeTruthy();
    expect(typeof tenant?.limits.maxMembers).toBe('number');
    expect(typeof tenant?.limits.maxWorkflows).toBe('number');
    expect(tenant?.limits.maxMembers).toBeGreaterThan(0);
  });

  // ── 6. suspendTenant sets status=suspended ────────────────────────────────
  it('6. suspendTenant sets status to suspended', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.suspendTenant(tenantId, 'cert77 test suspension');
    expect(tenant.status).toBe('suspended');
  });

  // ── 7. reactivateTenant sets status=active ────────────────────────────────
  it('7. reactivateTenant sets status back to active', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.reactivateTenant(tenantId);
    expect(tenant.status).toBe('active');
  });

  // ── 8. getTenant after reactivate shows active ────────────────────────────
  it('8. getTenant returns active status after reactivation', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.getTenant(tenantId);
    expect(tenant?.status).toBe('active');
  });

  // ── 9. org_tenant_limits row exists ──────────────────────────────────────
  it('9. org_tenant_limits row is written for the tenant', async () => {
    const result = await pool.query(`SELECT * FROM org_tenant_limits WHERE organization_id = $1`, [
      tenantId,
    ]);
    expect(result.rows.length).toBeGreaterThan(0);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row.max_members).toBeTruthy();
  });

  // ── 10. Cross-scope: two tenants are separate ────────────────────────────
  it('10. two created tenants have separate records', async () => {
    const svc = new TenantOperationsService(pool);
    const tenantB = await svc.createTenant({
      name: 'Cert77 Tenant B',
      slug: `cert77-tenant-b-${String(Date.now())}`,
      plan: 'enterprise',
      adminEmail: 'cert77-b@test.com',
    });
    tenantBId = tenantB.id;
    createdIds.push(tenantBId);

    const fetchedA = await svc.getTenant(tenantId);
    const fetchedB = await svc.getTenant(tenantBId);
    expect(fetchedA?.id).toBe(tenantId);
    expect(fetchedB?.id).toBe(tenantBId);
    expect(fetchedA?.id).not.toBe(fetchedB?.id);
    expect(fetchedA?.name).toBe('Cert77 Tenant A');
    expect(fetchedB?.name).toBe('Cert77 Tenant B');
  });
});
