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
 * 7.  Policy rule creation persists a record
 * 8.  Policy rules listing returns rules for the policy
 * 9.  Policy enforcement evaluation works
 * 10. Cross-tenant isolation — org B cannot see org A policies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { PolicyService, PolicyRuleService, PolicyEnforcementService } from '@galaxy/policy-engine';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3801-4000-8000-380000000001';
const orgIdB = '00000000-3801-4000-8000-380000000002';

let sharedPolicyId: string;

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
    'enforcing',
  );
  sharedPolicyId = policy.id;
});

afterAll(async () => {
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
      'enforcing',
    );

    expect(policy.id).toBeTruthy();
    expect(policy.organizationId).toBe(orgId);
    expect(policy.name).toBe('Expense Approval Policy');
    expect(policy.enforcementMode).toBe('enforcing');
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

  // ── 7. Policy rule creation ───────────────────────────────────────────────
  it('7. Policy rule creation persists a record', async () => {
    const svc = new PolicyRuleService(pool);

    const rule = await svc.addRule(
      orgId,
      sharedPolicyId,
      'amount',
      'gt',
      500,
      'require_approval',
      10,
    );

    expect(rule.id).toBeTruthy();
    expect(rule.organizationId).toBe(orgId);
    expect(rule.policyId).toBe(sharedPolicyId);
    expect(rule.field).toBe('amount');
    expect(rule.operator).toBe('gt');
    expect(rule.action).toBe('require_approval');
  });

  // ── 8. Policy rules listing ───────────────────────────────────────────────
  it('8. Policy rules listing returns rules for the policy', async () => {
    const svc = new PolicyRuleService(pool);

    const rules = await svc.getRules(orgId, sharedPolicyId);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.policyId).toBe(sharedPolicyId);
    }
  });

  // ── 9. Policy enforcement evaluation ─────────────────────────────────────
  it('9. Policy enforcement evaluation works', async () => {
    const svc = new PolicyEnforcementService(pool);

    const result = await svc.evaluate(orgId, sharedPolicyId, 'expense', 'exp-cert-001', {
      amount: 1000,
    });
    expect(result).toBeTruthy();
    expect(['allowed', 'denied', 'audited']).toContain(result.outcome);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A policies', async () => {
    const svc = new PolicyService(pool);

    const policiesB = await svc.listPolicies(orgIdB);
    const leaked = policiesB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
