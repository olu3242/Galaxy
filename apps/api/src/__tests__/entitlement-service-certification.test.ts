/**
 * Entitlement Service Certification Test Suite — Phase 75
 *
 * Certifies EntitlementService from @galaxy/platform-admin:
 * 1.  upsertEntitlement creates a plan entitlement
 * 2.  getEntitlementsForPlan returns array for that plan
 * 3.  isFeatureEntitled returns true when entitlement is enabled
 * 4.  isFeatureEntitled returns false when not found
 * 5.  setOrgOverride creates an override for the org
 * 6.  getOrgOverride returns the override
 * 7.  isFeatureEnabledForOrg respects org override (true)
 * 8.  isFeatureEnabledForOrg falls back to plan when no override
 * 9.  upsertEntitlement updates existing entitlement (upsert)
 * 10. Cross-org: override for org B does not affect org A
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { EntitlementService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7501-4000-8000-750100000001';
const orgIdB = '00000000-7501-4000-8000-750100000002';
const planTier = 'cert75-plan';
const featureKey = 'cert75.feature.test';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Entitlement Phase 75 Org A', 'entitlement-phase75-a', 'starter', 'active'),
            ($2, 'Entitlement Phase 75 Org B', 'entitlement-phase75-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_feature_overrides WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM plan_feature_entitlements WHERE plan_tier = $1`, [planTier])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Entitlement Service Certification', () => {
  // ── 1. upsertEntitlement creates entitlement ──────────────────────────────
  it('1. upsertEntitlement creates a plan-level entitlement', async () => {
    const svc = new EntitlementService(pool);
    const ent = await svc.upsertEntitlement(planTier, featureKey, true);
    expect(ent).toBeTruthy();
    expect(ent.id).toBeTruthy();
    expect(ent.planTier).toBe(planTier);
    expect(ent.featureKey).toBe(featureKey);
    expect(ent.isEnabled).toBe(true);
  });

  // ── 2. getEntitlementsForPlan returns array ───────────────────────────────
  it('2. getEntitlementsForPlan returns an array for the plan', async () => {
    const svc = new EntitlementService(pool);
    const ents = await svc.getEntitlementsForPlan(planTier);
    expect(Array.isArray(ents)).toBe(true);
    expect(ents.length).toBeGreaterThan(0);
    const found = ents.find((e) => e.featureKey === featureKey);
    expect(found).toBeTruthy();
  });

  // ── 3. isFeatureEntitled returns true when enabled ────────────────────────
  it('3. isFeatureEntitled returns true for an enabled entitlement', async () => {
    const svc = new EntitlementService(pool);
    const entitled = await svc.isFeatureEntitled(planTier, featureKey);
    expect(entitled).toBe(true);
  });

  // ── 4. isFeatureEntitled returns false when not found ─────────────────────
  it('4. isFeatureEntitled returns false when entitlement does not exist', async () => {
    const svc = new EntitlementService(pool);
    const entitled = await svc.isFeatureEntitled(planTier, 'cert75.nonexistent.feature');
    expect(entitled).toBe(false);
  });

  // ── 5. setOrgOverride creates an override ────────────────────────────────
  it('5. setOrgOverride creates an org-level feature override', async () => {
    const svc = new EntitlementService(pool);
    const override = await svc.setOrgOverride(orgId, featureKey, false, 'cert75 test override');
    expect(override).toBeTruthy();
    expect(override.organizationId).toBe(orgId);
    expect(override.featureKey).toBe(featureKey);
    expect(override.isEnabled).toBe(false);
  });

  // ── 6. getOrgOverride returns the override ────────────────────────────────
  it('6. getOrgOverride returns the stored override', async () => {
    const svc = new EntitlementService(pool);
    const override = await svc.getOrgOverride(orgId, featureKey);
    expect(override).toBeTruthy();
    expect(override?.organizationId).toBe(orgId);
    expect(override?.isEnabled).toBe(false);
  });

  // ── 7. isFeatureEnabledForOrg respects org override ──────────────────────
  it('7. isFeatureEnabledForOrg returns false because override disables it', async () => {
    const svc = new EntitlementService(pool);
    const enabled = await svc.isFeatureEnabledForOrg(orgId, featureKey, planTier);
    expect(enabled).toBe(false);
  });

  // ── 8. isFeatureEnabledForOrg falls back to plan entitlement ─────────────
  it('8. isFeatureEnabledForOrg falls back to plan when no override exists', async () => {
    const svc = new EntitlementService(pool);
    // orgIdB has no override — falls back to plan entitlement (enabled=true)
    const enabled = await svc.isFeatureEnabledForOrg(orgIdB, featureKey, planTier);
    expect(enabled).toBe(true);
  });

  // ── 9. upsertEntitlement updates on conflict ──────────────────────────────
  it('9. upsertEntitlement updates an existing entitlement (upsert)', async () => {
    const svc = new EntitlementService(pool);
    const updated = await svc.upsertEntitlement(planTier, featureKey, false);
    expect(updated.isEnabled).toBe(false);
    const entitled = await svc.isFeatureEntitled(planTier, featureKey);
    expect(entitled).toBe(false);
  });

  // ── 10. Cross-org isolation ───────────────────────────────────────────────
  it('10. override for org B does not affect org A override query', async () => {
    const svc = new EntitlementService(pool);
    await svc.setOrgOverride(orgIdB, featureKey, true, 'cert75 org B override');
    const overrideA = await svc.getOrgOverride(orgId, featureKey);
    const overrideB = await svc.getOrgOverride(orgIdB, featureKey);
    expect(overrideA?.organizationId).toBe(orgId);
    expect(overrideB?.organizationId).toBe(orgIdB);
    // org A override was set to false; org B to true — they must not bleed
    expect(overrideA?.isEnabled).toBe(false);
    expect(overrideB?.isEnabled).toBe(true);
  });
});
