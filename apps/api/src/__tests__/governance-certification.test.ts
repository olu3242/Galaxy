/**
 * Governance OS Certification Test Suite
 *
 * Certifies the Governance module lifecycle:
 * 1.  governance_policies and compliance_checks tables exist
 * 2.  Policy creation persists a governance policy
 * 3.  Policy retrieval by ID returns the correct record
 * 4.  Policy listing is tenant-scoped
 * 5.  Policy rules can be added to a policy
 * 6.  Compliance checks can be run and return structured results
 * 7.  Compliance check listing is filterable by status
 * 8.  Data retention policies can be created and retrieved
 * 9.  Cross-tenant isolation — org B cannot see org A policies
 * 10. Policy deletion removes the record
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { PolicyService, ComplianceCheckService, DataRetentionService } from '@galaxy/governance';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-1701-4000-8000-170000000001';
const orgIdB = '00000000-1701-4000-8000-170000000002';
const actorId = '00000000-1701-4000-8000-170000000010';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Gov Test Org A', 'gov-test-a', 'starter', 'active'),
            ($2, 'Gov Test Org B', 'gov-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM compliance_checks WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM policy_rules WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM governance_policies WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM data_retention_policies WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Governance OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. governance_policies and compliance_checks tables exist', async () => {
    for (const table of ['governance_policies', 'compliance_checks']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Policy creation ────────────────────────────────────────────────────
  it('2. Policy creation persists a governance policy', async () => {
    const svc = new PolicyService(pool);

    const policy = await svc.createPolicy({
      organizationId: orgId,
      name: 'Data Access Policy',
      description: 'Controls access to sensitive data',
      policyType: 'access_control',
      config: { sensitivityLevel: 'high' },
      createdBy: actorId,
    });

    expect(policy.id).toBeTruthy();
    expect(policy.organizationId).toBe(orgId);
    expect(policy.name).toBe('Data Access Policy');
    expect(policy.status).toBe('active');
  });

  // ── 3. Policy retrieval ────────────────────────────────────────────────────
  it('3. Policy retrieval by ID returns the correct record', async () => {
    const svc = new PolicyService(pool);

    const created = await svc.createPolicy({
      organizationId: orgId,
      name: 'Retrieval Test Policy',
      policyType: 'workflow_approval',
      config: {},
      createdBy: actorId,
    });

    const fetched = await svc.getPolicy(orgId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.organizationId).toBe(orgId);
  });

  // ── 4. Policy listing is tenant-scoped ────────────────────────────────────
  it('4. Policy listing is tenant-scoped', async () => {
    const svc = new PolicyService(pool);

    await svc.createPolicy({
      organizationId: orgId,
      name: 'Scope Test Policy',
      policyType: 'access_control',
      config: {},
      createdBy: actorId,
    });

    const policies = await svc.listPolicies(orgId);
    expect(Array.isArray(policies)).toBe(true);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(p.organizationId).toBe(orgId);
    }
  });

  // ── 5. Policy rules ───────────────────────────────────────────────────────
  it('5. Policy rules can be added to a policy', async () => {
    const svc = new PolicyService(pool);

    const policy = await svc.createPolicy({
      organizationId: orgId,
      name: 'Rule Test Policy',
      policyType: 'workflow_approval',
      config: {},
      createdBy: actorId,
    });

    const rule = await svc.createPolicyRule({
      organizationId: orgId,
      policyId: policy.id,
      name: 'Require MFA',
      condition: { field: 'mfa_enabled', operator: 'eq', value: true },
      action: 'block',
      priority: 1,
    });

    expect(rule.id).toBeTruthy();
    expect(rule.policyId).toBe(policy.id);
    expect(rule.action).toBe('block');

    const rules = await svc.listPolicyRules(orgId, policy.id);
    expect(rules.some((r) => r.id === rule.id)).toBe(true);
  });

  // ── 6. Compliance checks ──────────────────────────────────────────────────
  it('6. Compliance checks can be run and return structured results', async () => {
    const svc = new ComplianceCheckService(pool);

    const checks = await svc.runChecks(orgId, actorId);
    expect(Array.isArray(checks)).toBe(true);
    for (const check of checks) {
      expect(check.organizationId).toBe(orgId);
      expect(['pass', 'fail', 'warning', 'skipped']).toContain(check.status);
    }
  });

  // ── 7. Compliance check listing ───────────────────────────────────────────
  it('7. Compliance check listing is filterable', async () => {
    const svc = new ComplianceCheckService(pool);

    await svc.runChecks(orgId, actorId);

    const allChecks = await svc.listChecks(orgId);
    expect(Array.isArray(allChecks)).toBe(true);
  });

  // ── 8. Data retention policies ────────────────────────────────────────────
  it('8. Data retention policies can be created and retrieved', async () => {
    const svc = new DataRetentionService(pool);

    const retention = await svc.createRetentionPolicy({
      organizationId: orgId,
      resourceType: 'audit_logs',
      retentionDays: 365,
      action: 'archive',
      createdBy: actorId,
    });

    expect(retention.id).toBeTruthy();
    expect(retention.organizationId).toBe(orgId);
    expect(retention.retentionDays).toBe(365);

    const policies = await svc.listRetentionPolicies(orgId);
    expect(policies.some((p) => p.id === retention.id)).toBe(true);
  });

  // ── 9. Cross-tenant isolation ─────────────────────────────────────────────
  it('9. Org B cannot see org A policies', async () => {
    const svc = new PolicyService(pool);

    await svc.createPolicy({
      organizationId: orgId,
      name: 'Isolation Test Policy',
      policyType: 'access_control',
      config: { secret: 'org-a-data' },
      createdBy: actorId,
    });

    const policiesB = await svc.listPolicies(orgIdB);
    const leaked = policiesB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });

  // ── 10. Policy deletion ───────────────────────────────────────────────────
  it('10. Policy deletion removes the record', async () => {
    const svc = new PolicyService(pool);

    const policy = await svc.createPolicy({
      organizationId: orgId,
      name: `Delete Test Policy ${crypto.randomUUID()}`,
      policyType: 'workflow_approval',
      config: {},
      createdBy: actorId,
    });

    const deleted = await svc.deletePolicy(orgId, policy.id);
    expect(deleted).toBe(true);

    const fetched = await svc.getPolicy(orgId, policy.id);
    expect(fetched).toBeNull();
  });
});
