/**
 * Platform Commercial & Trial OS Certification Test Suite
 *
 * Certifies commercial policy management and trial subscription lifecycle:
 * 1.  createPolicy returns a CommercialPolicy
 * 2.  listPolicies includes the created policy
 * 3.  togglePolicy deactivates a policy
 * 4.  getActivePolicies excludes deactivated policies
 * 5.  togglePolicy reactivates a policy
 * 6.  getActivePolicies includes reactivated policy
 * 7.  startTrial creates a subscription with status trialing
 * 8.  getTrialStatus returns onTrial=true with daysRemaining
 * 9.  convertTrial transitions subscription to active
 * 10. convertTrial on non-trialing org returns null
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { CommercialPolicyService, TrialService, PlanService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6501-4000-8000-650000000001';
const orgIdB = '00000000-6501-4000-8000-650000000002';

let policyId: string;
let planId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Commercial Phase 65 Org A', 'commercial-phase65-a', 'starter', 'active'),
            ($2, 'Commercial Phase 65 Org B', 'commercial-phase65-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
  const planSvc = new PlanService(pool);
  const plan = await planSvc.createPlan({
    name: `commercial-cert-plan-${String(Date.now())}`,
    displayName: 'Commercial Cert Plan',
    priceCentsMonthly: 1900,
    priceCentsAnnual: 19000,
  });
  planId = plan.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM subscriptions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.query(`DELETE FROM commercial_policies WHERE id = $1`, [policyId]).catch(() => null);
  if (planId) {
    await pool.query(`DELETE FROM plans WHERE id = $1`, [planId]).catch(() => null);
  }
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Commercial & Trial OS Certification', () => {
  // ── 1. createPolicy returns CommercialPolicy ──────────────────────────────
  it('1. createPolicy returns a CommercialPolicy', async () => {
    const svc = new CommercialPolicyService(pool);
    const policy = await svc.createPolicy({
      policyType: 'discount',
      rules: { percentage: 10, minSeats: 5 },
    });
    expect(policy).toBeTruthy();
    expect(policy.id).toBeTruthy();
    expect(policy.policyType).toBe('discount');
    expect(policy.active).toBe(true);
    policyId = policy.id;
  });

  // ── 2. listPolicies includes created policy ───────────────────────────────
  it('2. listPolicies includes the created policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const policies = await svc.listPolicies();
    const ids = policies.map((p) => p.id);
    expect(ids).toContain(policyId);
  });

  // ── 3. togglePolicy deactivates ───────────────────────────────────────────
  it('3. togglePolicy deactivates a policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const policy = await svc.togglePolicy(policyId, false);
    expect(policy).not.toBeNull();
    expect(policy?.active).toBe(false);
  });

  // ── 4. getActivePolicies excludes deactivated ─────────────────────────────
  it('4. getActivePolicies excludes deactivated policies', async () => {
    const svc = new CommercialPolicyService(pool);
    const active = await svc.getActivePolicies('discount');
    const ids = active.map((p) => p.id);
    expect(ids).not.toContain(policyId);
  });

  // ── 5. togglePolicy reactivates ───────────────────────────────────────────
  it('5. togglePolicy reactivates a policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const policy = await svc.togglePolicy(policyId, true);
    expect(policy).not.toBeNull();
    expect(policy?.active).toBe(true);
  });

  // ── 6. getActivePolicies includes reactivated ─────────────────────────────
  it('6. getActivePolicies includes reactivated policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const active = await svc.getActivePolicies('discount');
    const ids = active.map((p) => p.id);
    expect(ids).toContain(policyId);
  });

  // ── 7. startTrial creates trialing subscription ───────────────────────────
  it('7. startTrial creates a subscription with status trialing', async () => {
    const svc = new TrialService(pool);
    const sub = await svc.startTrial({ organizationId: orgId, planId, trialDays: 14 });
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('trialing');
    expect(sub.organizationId).toBe(orgId);
    expect(sub.trialEndsAt).toBeTruthy();
  });

  // ── 8. getTrialStatus returns onTrial=true ────────────────────────────────
  it('8. getTrialStatus returns onTrial=true with daysRemaining', async () => {
    const svc = new TrialService(pool);
    const status = await svc.getTrialStatus(orgId);
    expect(status.onTrial).toBe(true);
    expect(typeof status.daysRemaining).toBe('number');
    expect(status.daysRemaining).toBeGreaterThan(0);
    expect(status.subscription).not.toBeNull();
  });

  // ── 9. convertTrial transitions to active ────────────────────────────────
  it('9. convertTrial transitions subscription to active', async () => {
    const svc = new TrialService(pool);
    const sub = await svc.convertTrial(orgId);
    expect(sub).not.toBeNull();
    expect(sub?.status).toBe('active');
  });

  // ── 10. convertTrial on non-trialing org returns null ────────────────────
  it('10. convertTrial on non-trialing org returns null', async () => {
    const svc = new TrialService(pool);
    const result = await svc.convertTrial(orgIdB);
    expect(result).toBeNull();
  });
});
