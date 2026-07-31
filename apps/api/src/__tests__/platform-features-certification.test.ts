/**
 * Platform Features OS Certification Test Suite
 *
 * Certifies the feature flag and entitlement lifecycle:
 * 1.  createFlag returns a FeatureFlag with enabled=false by default
 * 2.  listFlags includes the created flag
 * 3.  toggleFlag enables a flag
 * 4.  toggleFlag disables a flag
 * 5.  setEntitlement persists an org-level entitlement
 * 6.  getEntitlements returns the entitlement for the org
 * 7.  isEnabled returns true when org has an active entitlement
 * 8.  isEnabled returns false when org has no entitlement
 * 9.  setPlanFeature persists a plan-level feature association
 * 10. Cross-org entitlement isolation — org B entitlements are separate from org A
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { FeatureFlagService, EntitlementService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6301-4000-8000-630000000001';
const orgIdB = '00000000-6301-4000-8000-630000000002';

let flagId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Features Phase 63 Org A', 'features-phase63-a', 'starter', 'active'),
            ($2, 'Features Phase 63 Org B', 'features-phase63-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM plan_features WHERE feature_flag_id = $1`, [flagId])
    .catch(() => null);
  await pool
    .query(`DELETE FROM feature_entitlements WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  if (flagId) {
    await pool.query(`DELETE FROM feature_flags WHERE id = $1`, [flagId]).catch(() => null);
  }
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Features OS Certification', () => {
  // ── 1. createFlag returns FeatureFlag ─────────────────────────────────────
  it('1. createFlag returns a FeatureFlag with enabled=false by default', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.createFlag({
      name: `phase63-flag-${String(Date.now())}`,
      description: 'Phase 63 certification flag',
    });
    expect(flag).toBeTruthy();
    expect(flag.id).toBeTruthy();
    expect(flag.enabled).toBe(false);
    flagId = flag.id;
  });

  // ── 2. listFlags includes created flag ────────────────────────────────────
  it('2. listFlags includes the created flag', async () => {
    const svc = new FeatureFlagService(pool);
    const flags = await svc.listFlags();
    const ids = flags.map((f) => f.id);
    expect(ids).toContain(flagId);
  });

  // ── 3. toggleFlag enables ─────────────────────────────────────────────────
  it('3. toggleFlag enables a flag', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.toggleFlag(flagId, true);
    expect(flag).not.toBeNull();
    expect(flag?.enabled).toBe(true);
  });

  // ── 4. toggleFlag disables ────────────────────────────────────────────────
  it('4. toggleFlag disables a flag', async () => {
    const svc = new FeatureFlagService(pool);
    const flag = await svc.toggleFlag(flagId, false);
    expect(flag).not.toBeNull();
    expect(flag?.enabled).toBe(false);
  });

  // ── 5. setEntitlement persists ────────────────────────────────────────────
  it('5. setEntitlement persists an org-level entitlement', async () => {
    const svc = new FeatureFlagService(pool);
    const entitlement = await svc.setEntitlement({
      organizationId: orgId,
      featureFlagId: flagId,
      enabled: true,
    });
    expect(entitlement).toBeTruthy();
    expect(entitlement.organizationId).toBe(orgId);
    expect(entitlement.featureFlagId).toBe(flagId);
    expect(entitlement.enabled).toBe(true);
  });

  // ── 6. getEntitlements returns entitlement ────────────────────────────────
  it('6. getEntitlements returns the entitlement for the org', async () => {
    const svc = new FeatureFlagService(pool);
    const entitlements = await svc.getEntitlements(orgId);
    const found = entitlements.find((e) => e.featureFlagId === flagId);
    expect(found).toBeTruthy();
    expect(found?.enabled).toBe(true);
  });

  // ── 7. isEnabled returns true when entitled ───────────────────────────────
  it('7. isEnabled returns true when org has an active entitlement', async () => {
    const svc = new FeatureFlagService(pool);
    const flags = await svc.listFlags();
    const flag = flags.find((f) => f.id === flagId);
    if (!flag) return;
    const enabled = await svc.isEnabled(orgId, flag.name);
    expect(enabled).toBe(true);
  });

  // ── 8. isEnabled returns false when not entitled ──────────────────────────
  it('8. isEnabled returns false when org has no entitlement', async () => {
    const svc = new FeatureFlagService(pool);
    const flags = await svc.listFlags();
    const flag = flags.find((f) => f.id === flagId);
    if (!flag) return;
    const enabled = await svc.isEnabled(orgIdB, flag.name);
    expect(enabled).toBe(false);
  });

  // ── 9. setPlanFeature persists plan-level feature ─────────────────────────
  it('9. setPlanFeature persists a plan-level feature association', async () => {
    const svc = new EntitlementService(pool);
    const pf = await svc.setPlanFeature({
      planName: 'starter',
      featureFlagId: flagId,
      included: true,
    });
    expect(pf).toBeTruthy();
    expect(pf.planName).toBe('starter');
    expect(pf.featureFlagId).toBe(flagId);
    expect(pf.included).toBe(true);
  });

  // ── 10. Cross-org entitlement isolation ───────────────────────────────────
  it('10. Org B entitlements are separate from org A', async () => {
    const svc = new FeatureFlagService(pool);
    const entitlementsA = await svc.getEntitlements(orgId);
    const entitlementsB = await svc.getEntitlements(orgIdB);
    expect(entitlementsA.every((e) => e.organizationId === orgId)).toBe(true);
    expect(entitlementsB.every((e) => e.organizationId === orgIdB)).toBe(true);
    expect(entitlementsA.some((e) => e.organizationId === orgIdB)).toBe(false);
  });
});
