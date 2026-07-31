/**
 * Commercial Policy Service Certification Test Suite — Phase 89
 *
 * Certifies CommercialPolicyService from @galaxy/platform:
 * 1.  createPolicy creates a commercial policy
 * 2.  policy has correct policyType and rules
 * 3.  policy is active by default
 * 4.  listPolicies returns an array
 * 5.  listPolicies filters by policyType
 * 6.  togglePolicy deactivates a policy
 * 7.  getActivePolicies returns only active policies
 * 8.  togglePolicy reactivates a policy
 * 9.  getActivePolicies filters by policyType
 * 10. Cross-type: getActivePolicies returns correct policies per type
 */

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { CommercialPolicyService, type CommercialPolicy } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool
    .query(`DELETE FROM commercial_policies WHERE policy_type LIKE 'cert89.%'`)
    .catch(() => null);
  await pool.end();
});

describe('Commercial Policy Service Certification', () => {
  let policyId: string;

  // ── 1. createPolicy creates a commercial policy ───────────────────────────
  it('1. createPolicy creates a commercial policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const policy: CommercialPolicy = await svc.createPolicy({
      policyType: 'cert89.discount',
      rules: { percent: 10, minSeats: 5 },
    });
    expect(policy).toBeTruthy();
    expect(policy.id).toBeTruthy();
    policyId = policy.id;
  });

  // ── 2. policy has correct policyType and rules ────────────────────────────
  it('2. policy has correct policyType and rules', async () => {
    const svc = new CommercialPolicyService(pool);
    const policy: CommercialPolicy = await svc.createPolicy({
      policyType: 'cert89.refund',
      rules: { windowDays: 30, fullRefund: true },
    });
    expect(policy.policyType).toBe('cert89.refund');
    expect(policy.rules).toMatchObject({ windowDays: 30, fullRefund: true });
  });

  // ── 3. policy is active by default ────────────────────────────────────────
  it('3. newly created policy is active by default', async () => {
    const svc = new CommercialPolicyService(pool);
    const policies: CommercialPolicy[] = await svc.getActivePolicies('cert89.discount');
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.every((p) => p.active)).toBe(true);
  });

  // ── 4. listPolicies returns an array ──────────────────────────────────────
  it('4. listPolicies returns an array', async () => {
    const svc = new CommercialPolicyService(pool);
    const policies: CommercialPolicy[] = await svc.listPolicies('cert89.discount');
    expect(Array.isArray(policies)).toBe(true);
    expect(policies.length).toBeGreaterThan(0);
  });

  // ── 5. listPolicies filters by policyType ─────────────────────────────────
  it('5. listPolicies filters by policyType', async () => {
    const svc = new CommercialPolicyService(pool);
    const policies: CommercialPolicy[] = await svc.listPolicies('cert89.discount');
    expect(policies.every((p) => p.policyType === 'cert89.discount')).toBe(true);
  });

  // ── 6. togglePolicy deactivates a policy ─────────────────────────────────
  it('6. togglePolicy deactivates a policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const updated: CommercialPolicy | null = await svc.togglePolicy(policyId, false);
    expect(updated).toBeTruthy();
    expect(updated?.active).toBe(false);
  });

  // ── 7. getActivePolicies excludes inactive policies ───────────────────────
  it('7. getActivePolicies excludes the deactivated policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const active: CommercialPolicy[] = await svc.getActivePolicies('cert89.discount');
    const found = active.find((p) => p.id === policyId);
    expect(found).toBeUndefined();
  });

  // ── 8. togglePolicy reactivates a policy ─────────────────────────────────
  it('8. togglePolicy reactivates a policy', async () => {
    const svc = new CommercialPolicyService(pool);
    const updated: CommercialPolicy | null = await svc.togglePolicy(policyId, true);
    expect(updated).toBeTruthy();
    expect(updated?.active).toBe(true);
  });

  // ── 9. getActivePolicies filters by policyType ───────────────────────────
  it('9. getActivePolicies returns only active policies for given type', async () => {
    const svc = new CommercialPolicyService(pool);
    const active: CommercialPolicy[] = await svc.getActivePolicies('cert89.discount');
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((p) => p.policyType === 'cert89.discount' && p.active)).toBe(true);
  });

  // ── 10. Cross-type: getActivePolicies per type ───────────────────────────
  it('10. getActivePolicies returns correct policies per type', async () => {
    const svc = new CommercialPolicyService(pool);
    const discounts: CommercialPolicy[] = await svc.getActivePolicies('cert89.discount');
    const refunds: CommercialPolicy[] = await svc.getActivePolicies('cert89.refund');
    expect(discounts.every((p) => p.policyType === 'cert89.discount')).toBe(true);
    expect(refunds.every((p) => p.policyType === 'cert89.refund')).toBe(true);
    expect(discounts.length).toBeGreaterThan(0);
    expect(refunds.length).toBeGreaterThan(0);
  });
});
