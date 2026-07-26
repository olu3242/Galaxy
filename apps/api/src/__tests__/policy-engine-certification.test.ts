/**
 * Policy Engine OS Certification Test Suite
 *
 * Certifies the Policy Engine module lifecycle:
 * 1.  policies and policy_rules tables exist
 * 2.  Policy creation persists a record
 * 3.  Policy retrieval returns the policy
 * 4.  Policy listing is tenant-scoped
 * 5.  Policy activation sets status to active
 * 6.  Policy deactivation sets status to inactive
 * 7.  Enforcement evaluation on inactive policy returns allowed
 * 8.  Enforcement evaluation on active policy returns an outcome
 * 9.  Multiple policies are all listed
 * 10. Cross-tenant isolation — org B cannot see org A policies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PolicyService, PolicyEnforcementService } from '@galaxy/policy-engine';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3801-4000-8000-380000000001';
const orgIdB = '00000000-3801-4000-8000-380000000002';

let sharedPolicyId: string;
let secondPolicyId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Policy Test Org A', 'policy-test-a', 'starter', 'active'),
            ($2, 'Policy Test Org B', 'policy-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new PolicyService(pool);
  const policy = await svc.createPolicy(
    orgId,
    'Shared Cert Policy',
    'Certification shared policy',
    'enforce',
  );
  sharedPolicyId = policy.id;

  const policy2 = await svc.createPolicy(
    orgId,
    'Second Cert Policy',
    'Second policy for listing test',
    'audit',
  );
  secondPolicyId = policy2.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM policy_enforcement_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM policy_rules WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM policies WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Policy Engine OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. policies and policy_rules tables exist', async () => {
    for (const table of ['policies', 'policy_rules']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Policy creation ────────────────────────────────────────────────────
  it('2. Policy creation persists a record', async () => {
    const svc = new PolicyService(pool);

    const policy = await svc.createPolicy(
      orgId,
      'Expense Approval Policy',
      'Requires approval for expenses over $500',
      'enforce',
    );

    expect(policy.id).toBeTruthy();
    expect(policy.organizationId).toBe(orgId);
    expect(policy.name).toBe('Expense Approval Policy');
    expect(policy.enforcementMode).toBe('enforce');
  });

  // ── 3. Policy retrieval ───────────────────────────────────────────────────
  it('3. Policy retrieval returns the policy', async () => {
    const svc = new PolicyService(pool);

    const policy = await svc.getPolicy(orgId, sharedPolicyId);
    expect(policy.id).toBe(sharedPolicyId);
    expect(policy.organizationId).toBe(orgId);
  });

  // ── 4. Policy listing ─────────────────────────────────────────────────────
  it('4. Policy listing is tenant-scoped', async () => {
    const svc = new PolicyService(pool);

    const policies = await svc.listPolicies(orgId);
    expect(Array.isArray(policies)).toBe(true);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(p.organizationId).toBe(orgId);
    }
  });

  // ── 5. Policy activation ──────────────────────────────────────────────────
  it('5. Policy activation sets status to active', async () => {
    const svc = new PolicyService(pool);

    const activated = await svc.activatePolicy(orgId, sharedPolicyId);
    expect(activated.status).toBe('active');
  });

  // ── 6. Policy deactivation ────────────────────────────────────────────────
  it('6. Policy deactivation sets status to inactive', async () => {
    const svc = new PolicyService(pool);

    const deactivated = await svc.deactivatePolicy(orgId, sharedPolicyId);
    expect(deactivated.status).toBe('inactive');
  });

  // ── 7. Enforcement of inactive policy returns allowed ─────────────────────
  it('7. Enforcement evaluation on inactive policy returns allowed', async () => {
    const svc = new PolicyEnforcementService(pool);

    const result = await svc.evaluate(orgId, sharedPolicyId, 'expense', 'exp-cert-001', {
      amount: 1000,
    });
    expect(result).toBeTruthy();
    expect(result.outcome).toBe('allowed');
  });

  // ── 8. Enforcement of active policy returns an outcome ────────────────────
  it('8. Enforcement evaluation on active policy returns an outcome', async () => {
    const svc = new PolicyService(pool);
    const enfSvc = new PolicyEnforcementService(pool);

    await svc.activatePolicy(orgId, secondPolicyId);
    const result = await enfSvc.evaluate(orgId, secondPolicyId, 'task', 'task-cert-001', {
      priority: 'high',
    });
    expect(['allowed', 'denied', 'audited']).toContain(result.outcome);
  });

  // ── 9. Multiple policies are all listed ───────────────────────────────────
  it('9. Multiple policies listed', async () => {
    const svc = new PolicyService(pool);

    const policies = await svc.listPolicies(orgId);
    const ids = policies.map((p) => p.id);
    expect(ids).toContain(sharedPolicyId);
    expect(ids).toContain(secondPolicyId);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A policies', async () => {
    const svc = new PolicyService(pool);

    const policiesB = await svc.listPolicies(orgIdB);
    const leaked = policiesB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
