/**
 * Feature Flag Service Certification Test Suite — Phase 76
 *
 * Certifies FeatureFlagService from @galaxy/platform-admin:
 * 1.  createFlag creates a global feature flag
 * 2.  created flag has correct key and isEnabled
 * 3.  getFlag retrieves flag by key (global scope)
 * 4.  listFlags returns an array
 * 5.  listFlags includes the created flag
 * 6.  toggleFlag disables a flag
 * 7.  isFlagEnabled returns false after toggle-off
 * 8.  createFlag with tenant scope attaches targetTenantId
 * 9.  getFlag with tenantId returns tenant-scoped flag first
 * 10. deleteFlag removes the flag; getFlag returns null
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { FeatureFlagService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7601-4000-8000-760100000001';
const flagKey = 'cert76.feature.flag';
const tenantFlagKey = 'cert76.tenant.flag';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Feature Flag Phase 76 Org', 'featureflag-phase76', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM feature_flags WHERE key IN ($1, $2)`, [flagKey, tenantFlagKey])
    .catch(() => null);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]).catch(() => null);
  await pool.end();
});

describe('Feature Flag Service Certification', () => {
  let flagId: string;
  let tenantFlagId: string;

  // ── 1. createFlag creates a global flag ───────────────────────────────────
  it('1. createFlag creates a global feature flag', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.createFlag({
      key: flagKey,
      description: 'Phase 76 cert flag',
      isEnabled: true,
      scope: 'global',
    });
    expect(flag).toBeTruthy();
    expect(flag.id).toBeTruthy();
    flagId = flag.id;
  });

  // ── 2. created flag has correct key and isEnabled ────────────────────────
  it('2. created flag has correct key and isEnabled=true', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.createFlag({
      key: `${flagKey}.extra`,
      isEnabled: true,
      scope: 'global',
    });
    expect(flag.key).toBe(`${flagKey}.extra`);
    expect(flag.isEnabled).toBe(true);
    // cleanup
    await svc.deleteFlag(flag.id);
  });

  // ── 3. getFlag retrieves flag by key ─────────────────────────────────────
  it('3. getFlag retrieves the flag by key', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.getFlag(flagKey);
    expect(flag).toBeTruthy();
    expect(flag?.key).toBe(flagKey);
    expect(flag?.isEnabled).toBe(true);
  });

  // ── 4. listFlags returns an array ────────────────────────────────────────
  it('4. listFlags returns an array of flags', async () => {
    const svc = new FeatureFlagService(pool);
    const flags = await svc.listFlags();
    expect(Array.isArray(flags)).toBe(true);
    expect(flags.length).toBeGreaterThan(0);
  });

  // ── 5. listFlags includes the created flag ───────────────────────────────
  it('5. listFlags includes the cert flag', async () => {
    const svc = new FeatureFlagService(pool);
    const flags = await svc.listFlags({ scope: 'global' });
    const found = flags.find((f) => f.key === flagKey);
    expect(found).toBeTruthy();
  });

  // ── 6. toggleFlag disables a flag ────────────────────────────────────────
  it('6. toggleFlag disables the flag (isEnabled=false)', async () => {
    const svc = new FeatureFlagService(pool);
    const updated = await svc.toggleFlag(flagId, false);
    expect(updated).toBeTruthy();
    expect(updated?.isEnabled).toBe(false);
  });

  // ── 7. isFlagEnabled returns false after toggle-off ───────────────────────
  it('7. isFlagEnabled returns false after disabling', async () => {
    const svc = new FeatureFlagService(pool);
    const enabled = await svc.isFlagEnabled(flagKey);
    expect(enabled).toBe(false);
  });

  // ── 8. createFlag with tenant scope attaches targetTenantId ──────────────
  it('8. createFlag with tenant scope sets targetTenantId', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.createFlag({
      key: tenantFlagKey,
      isEnabled: true,
      scope: 'tenant',
      targetTenantId: orgId,
    });
    expect(flag.targetTenantId).toBe(orgId);
    expect(flag.scope).toBe('tenant');
    tenantFlagId = flag.id;
  });

  // ── 9. getFlag with tenantId returns tenant-scoped flag ──────────────────
  it('9. getFlag with tenantId returns the tenant-scoped flag', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.getFlag(tenantFlagKey, orgId);
    expect(flag).toBeTruthy();
    expect(flag?.targetTenantId).toBe(orgId);
  });

  // ── 10. deleteFlag removes the flag ──────────────────────────────────────
  it('10. deleteFlag removes tenant flag; getFlag returns null', async () => {
    const svc = new FeatureFlagService(pool);
    const deleted = await svc.deleteFlag(tenantFlagId);
    expect(deleted).toBe(true);
    const flag = await svc.getFlag(tenantFlagKey, orgId);
    expect(flag).toBeNull();
  });
});
