/**
 * Platform Tenant OS Certification Test Suite
 *
 * Certifies the platform tenant module lifecycle:
 * 1.  createTenant returns a valid Tenant with status 'active'
 * 2.  getTenant retrieves the created tenant by ID
 * 3.  listTenants includes created tenant
 * 4.  updateTenantStatus changes status correctly
 * 5.  setSetting persists a tenant setting key/value pair
 * 6.  getSettings returns the stored setting
 * 7.  recordHealth stores a TenantHealth entry
 * 8.  getLatestHealth returns the most recent health record
 * 9.  setTenantLimit persists a resource limit
 * 10. getTenantLimits returns the stored limit
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { TenantOperationsService, TenantHealthService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let tenantId: string;
let tenantIdB: string;

beforeAll(async () => {
  const svc = new TenantOperationsService(pool);
  const a = await svc.createTenant({ name: 'Platform Tenant Test A' });
  const b = await svc.createTenant({ name: 'Platform Tenant Test B' });
  tenantId = a.id;
  tenantIdB = b.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM tenant_limits WHERE tenant_id IN ($1, $2)`, [tenantId, tenantIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM tenant_health WHERE tenant_id IN ($1, $2)`, [tenantId, tenantIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM tenant_settings WHERE tenant_id IN ($1, $2)`, [tenantId, tenantIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantId, tenantIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Tenant OS Certification', () => {
  // ── 1. createTenant returns valid Tenant ──────────────────────────────────
  it('1. createTenant returns a valid Tenant with status active', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.getTenant(tenantId);
    expect(tenant).toBeTruthy();
    expect(tenant?.id).toBe(tenantId);
    expect(tenant?.name).toBe('Platform Tenant Test A');
    expect(tenant?.status).toBe('active');
  });

  // ── 2. getTenant retrieves by ID ──────────────────────────────────────────
  it('2. getTenant retrieves the created tenant by ID', async () => {
    const svc = new TenantOperationsService(pool);
    const tenant = await svc.getTenant(tenantId);
    expect(tenant).not.toBeNull();
    expect(tenant?.id).toBe(tenantId);
  });

  // ── 3. listTenants includes created tenant ────────────────────────────────
  it('3. listTenants includes created tenant', async () => {
    const svc = new TenantOperationsService(pool);
    const tenants = await svc.listTenants();
    const ids = tenants.map((t) => t.id);
    expect(ids).toContain(tenantId);
  });

  // ── 4. updateTenantStatus changes status ──────────────────────────────────
  it('4. updateTenantStatus changes status correctly', async () => {
    const svc = new TenantOperationsService(pool);
    const updated = await svc.updateTenantStatus(tenantId, 'suspended');
    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('suspended');
    await svc.updateTenantStatus(tenantId, 'active');
  });

  // ── 5. setSetting persists key/value ─────────────────────────────────────
  it('5. setSetting persists a tenant setting key/value pair', async () => {
    const svc = new TenantOperationsService(pool);
    const setting = await svc.setSetting(tenantId, 'max_users', '100');
    expect(setting).toBeTruthy();
    expect(setting.key).toBe('max_users');
    expect(setting.value).toBe('100');
  });

  // ── 6. getSettings returns stored settings ────────────────────────────────
  it('6. getSettings returns the stored setting', async () => {
    const svc = new TenantOperationsService(pool);
    const settings = await svc.getSettings(tenantId);
    const found = settings.find((s) => s.key === 'max_users');
    expect(found).toBeTruthy();
    expect(found?.value).toBe('100');
  });

  // ── 7. recordHealth stores entry ──────────────────────────────────────────
  it('7. recordHealth stores a TenantHealth entry', async () => {
    const svc = new TenantHealthService(pool);
    const health = await svc.recordHealth({ tenantId, score: 85, metrics: { uptime: 99.9 } });
    expect(health).toBeTruthy();
    expect(health.tenantId).toBe(tenantId);
    expect(health.score).toBe(85);
  });

  // ── 8. getLatestHealth returns most recent ────────────────────────────────
  it('8. getLatestHealth returns the most recent health record', async () => {
    const svc = new TenantHealthService(pool);
    const health = await svc.getLatestHealth(tenantId);
    expect(health).not.toBeNull();
    expect(health?.tenantId).toBe(tenantId);
    expect(typeof health?.score).toBe('number');
  });

  // ── 9. setTenantLimit persists limit ─────────────────────────────────────
  it('9. setTenantLimit persists a resource limit', async () => {
    const svc = new TenantHealthService(pool);
    const limit = await svc.setTenantLimit({
      tenantId,
      resourceType: 'api_calls',
      limitValue: 10000,
    });
    expect(limit).toBeTruthy();
    expect(limit.resourceType).toBe('api_calls');
    expect(limit.limitValue).toBe(10000);
  });

  // ── 10. getTenantLimits returns stored limits ─────────────────────────────
  it('10. getTenantLimits returns the stored limit', async () => {
    const svc = new TenantHealthService(pool);
    const limits = await svc.getTenantLimits(tenantId);
    const found = limits.find((l) => l.resourceType === 'api_calls');
    expect(found).toBeTruthy();
    expect(found?.limitValue).toBe(10000);
  });
});
