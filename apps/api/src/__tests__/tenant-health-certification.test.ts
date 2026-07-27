/**
 * Tenant Health Service Certification Test Suite — Phase 79
 *
 * Certifies TenantHealthService from @galaxy/platform:
 * 1.  recordHealth creates a health snapshot
 * 2.  recordHealth stores the tenantId correctly
 * 3.  getLatestHealth returns the most recent snapshot
 * 4.  getLatestHealth returns null for unknown tenant
 * 5.  setTenantLimit creates a limit record
 * 6.  getTenantLimits returns limits for the tenant
 * 7.  setTenantLimit updates on conflict (upsert)
 * 8.  multiple recordHealth calls — getLatestHealth returns most recent
 * 9.  getTenantLimits returns empty array for tenant with no limits
 * 10. Cross-tenant: health records are separate per tenant
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { TenantHealthService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7901-4000-8000-790100000001';
const orgIdB = '00000000-7901-4000-8000-790100000002';
const orgIdC = '00000000-7901-4000-8000-790100000003';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'TenantHealth Phase 79 Org A', 'tenanthealth-phase79-a', 'starter', 'active'),
            ($2, 'TenantHealth Phase 79 Org B', 'tenanthealth-phase79-b', 'starter', 'active'),
            ($3, 'TenantHealth Phase 79 Org C', 'tenanthealth-phase79-c', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB, orgIdC],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM platform_tenant_limits WHERE tenant_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM tenant_health WHERE tenant_id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool.end();
});

describe('Tenant Health Service Certification', () => {
  // ── 1. recordHealth creates snapshot ─────────────────────────────────────
  it('1. recordHealth creates a health snapshot', async () => {
    const svc = new TenantHealthService(pool);
    const health = await svc.recordHealth({ tenantId: orgId, score: 85, metrics: { cpu: 0.3 } });
    expect(health).toBeTruthy();
    expect(health.id).toBeTruthy();
  });

  // ── 2. recordHealth stores tenantId ──────────────────────────────────────
  it('2. recordHealth stores the tenantId correctly', async () => {
    const svc = new TenantHealthService(pool);
    const health = await svc.recordHealth({ tenantId: orgId, score: 90, metrics: { cpu: 0.2 } });
    expect(health.tenantId).toBe(orgId);
    expect(health.score).toBe(90);
  });

  // ── 3. getLatestHealth returns most recent snapshot ───────────────────────
  it('3. getLatestHealth returns a snapshot for the tenant', async () => {
    const svc = new TenantHealthService(pool);
    const health = await svc.getLatestHealth(orgId);
    expect(health).toBeTruthy();
    expect(health?.tenantId).toBe(orgId);
  });

  // ── 4. getLatestHealth returns null for unknown ───────────────────────────
  it('4. getLatestHealth returns null for an unknown tenantId', async () => {
    const svc = new TenantHealthService(pool);
    const health = await svc.getLatestHealth('00000000-0000-0000-0000-000000000000');
    expect(health).toBeNull();
  });

  // ── 5. setTenantLimit creates a limit record ──────────────────────────────
  it('5. setTenantLimit creates a limit record', async () => {
    const svc = new TenantHealthService(pool);
    const limit = await svc.setTenantLimit({
      tenantId: orgId,
      resourceType: 'api_calls',
      limitValue: 10000,
    });
    expect(limit).toBeTruthy();
    expect(limit.id).toBeTruthy();
    expect(limit.resourceType).toBe('api_calls');
    expect(limit.limitValue).toBe(10000);
  });

  // ── 6. getTenantLimits returns limits ────────────────────────────────────
  it('6. getTenantLimits returns limits for the tenant', async () => {
    const svc = new TenantHealthService(pool);
    const limits = await svc.getTenantLimits(orgId);
    expect(Array.isArray(limits)).toBe(true);
    expect(limits.length).toBeGreaterThan(0);
    expect(limits.every((l) => l.tenantId === orgId)).toBe(true);
  });

  // ── 7. setTenantLimit upserts on conflict ────────────────────────────────
  it('7. setTenantLimit updates limitValue on upsert', async () => {
    const svc = new TenantHealthService(pool);
    const updated = await svc.setTenantLimit({
      tenantId: orgId,
      resourceType: 'api_calls',
      limitValue: 50000,
    });
    expect(updated.limitValue).toBe(50000);
  });

  // ── 8. getLatestHealth returns most recent of multiple ───────────────────
  it('8. getLatestHealth returns most recent of multiple snapshots', async () => {
    const svc = new TenantHealthService(pool);
    await svc.recordHealth({ tenantId: orgIdB, score: 60, metrics: {} });
    await svc.recordHealth({ tenantId: orgIdB, score: 95, metrics: { status: 'latest' } });
    const health = await svc.getLatestHealth(orgIdB);
    expect(health?.score).toBe(95);
  });

  // ── 9. getTenantLimits empty for no limits ───────────────────────────────
  it('9. getTenantLimits returns empty array for tenant with no limits', async () => {
    const svc = new TenantHealthService(pool);
    const limits = await svc.getTenantLimits(orgIdC);
    expect(Array.isArray(limits)).toBe(true);
    expect(limits.length).toBe(0);
  });

  // ── 10. Cross-tenant: health records are separate ────────────────────────
  it('10. health snapshots are separate per tenant', async () => {
    const svc = new TenantHealthService(pool);
    const healthA = await svc.getLatestHealth(orgId);
    const healthB = await svc.getLatestHealth(orgIdB);
    expect(healthA?.tenantId).toBe(orgId);
    expect(healthB?.tenantId).toBe(orgIdB);
    expect(healthA?.tenantId).not.toBe(healthB?.tenantId);
  });
});
