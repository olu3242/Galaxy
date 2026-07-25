/**
 * Organization OS Certification Test Suite
 *
 * Certifies the Organization module lifecycle:
 * 1.  org_hierarchy_nodes and delegations tables exist
 * 2.  Hierarchy node creation persists a record
 * 3.  Child node creation links to parent
 * 4.  Hierarchy node retrieval returns correct record
 * 5.  Child node listing returns children
 * 6.  Delegation creation persists a record
 * 7.  Active delegation retrieval returns correct record
 * 8.  Delegation revocation removes active status
 * 9.  Agent permission creation persists a record
 * 10. Agent permission canWrite check returns boolean
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { HierarchyService, DelegationService, AgentPermissionService } from '@galaxy/organization';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3001-4000-8000-300000000001';
const orgIdB = '00000000-3001-4000-8000-300000000002';
const delegatorId = '00000000-3001-4000-8000-300000000010';
const delegateeId = '00000000-3001-4000-8000-300000000011';
const roleId = '00000000-3001-4000-8000-300000000012';
const approvedById = '00000000-3001-4000-8000-300000000013';

let sharedParentNodeId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Org Test Org A', 'org-test-a', 'starter', 'active'),
            ($2, 'Org Test Org B', 'org-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new HierarchyService(pool);
  const node = await svc.createNode({
    organizationId: orgId,
    level: 'division',
    name: 'Corporate Division',
    code: 'CORP',
  });
  sharedParentNodeId = node.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM agent_permissions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM delegations WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM org_hierarchy_nodes WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Organization OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. org_hierarchy_nodes and delegations tables exist', async () => {
    for (const table of ['org_hierarchy_nodes', 'delegations']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Hierarchy node creation ────────────────────────────────────────────
  it('2. Hierarchy node creation persists a record', async () => {
    const svc = new HierarchyService(pool);

    const node = await svc.createNode({
      organizationId: orgId,
      level: 'department',
      name: 'Operations',
      code: 'OPS',
    });

    expect(node.id).toBeTruthy();
    expect(node.organizationId).toBe(orgId);
    expect(node.name).toBe('Operations');
  });

  // ── 3. Child node creation ────────────────────────────────────────────────
  it('3. Child node creation links to parent', async () => {
    const svc = new HierarchyService(pool);

    const child = await svc.createNode({
      organizationId: orgId,
      parentId: sharedParentNodeId,
      level: 'team',
      name: 'Engineering Team',
      code: 'ENG',
    });

    expect(child.id).toBeTruthy();
    expect(child.parentId).toBe(sharedParentNodeId);
  });

  // ── 4. Hierarchy node retrieval ───────────────────────────────────────────
  it('4. Hierarchy node retrieval returns correct record', async () => {
    const svc = new HierarchyService(pool);

    const node = await svc.getNode(orgId, sharedParentNodeId);
    expect(node).not.toBeNull();
    expect(node?.id).toBe(sharedParentNodeId);
    expect(node?.organizationId).toBe(orgId);
  });

  // ── 5. Child node listing ─────────────────────────────────────────────────
  it('5. Child node listing returns children', async () => {
    const svc = new HierarchyService(pool);

    const children = await svc.getChildren(orgId, sharedParentNodeId);
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBeGreaterThan(0);
    for (const c of children) {
      expect(c.parentId).toBe(sharedParentNodeId);
    }
  });

  // ── 6. Delegation creation ────────────────────────────────────────────────
  it('6. Delegation creation persists a record', async () => {
    const svc = new DelegationService(pool);

    const now = new Date();
    const delegation = await svc.create({
      organizationId: orgId,
      delegatorId,
      delegateeId,
      roleId,
      permissions: ['approval:submit', 'workflow:start'],
      reason: 'Annual leave coverage',
      startAt: now.toISOString(),
      endAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
      approvedBy: approvedById,
    });

    expect(delegation.id).toBeTruthy();
    expect(delegation.organizationId).toBe(orgId);
    expect(delegation.delegatorId).toBe(delegatorId);
    expect(delegation.delegateeId).toBe(delegateeId);
  });

  // ── 7. Active delegation retrieval ───────────────────────────────────────
  it('7. Active delegation retrieval returns correct record', async () => {
    const svc = new DelegationService(pool);

    const active = await svc.getActive(orgId, delegateeId);
    expect(Array.isArray(active)).toBe(true);
    expect(active.length).toBeGreaterThan(0);
    expect(active.some((d) => d.delegateeId === delegateeId)).toBe(true);
  });

  // ── 8. Delegation revocation ──────────────────────────────────────────────
  it('8. Delegation revocation removes active status', async () => {
    const svc = new DelegationService(pool);

    const now = new Date();
    const delegation = await svc.create({
      organizationId: orgId,
      delegatorId,
      delegateeId,
      permissions: ['report:read'],
      reason: 'Temporary access for audit',
      startAt: now.toISOString(),
      endAt: new Date(now.getTime() + 3 * 86400000).toISOString(),
    });

    await svc.revoke(orgId, delegation.id);

    const active = await svc.getActive(orgId, delegateeId);
    const stillActive = active.some((d) => d.id === delegation.id && d.status === 'active');
    expect(stillActive).toBe(false);
  });

  // ── 9. Agent permission creation ──────────────────────────────────────────
  it('9. Agent permission creation persists a record', async () => {
    const svc = new AgentPermissionService(pool);

    const agentType = `loop-agent-${crypto.randomUUID().slice(0, 8)}`;
    const perm = await svc.create({
      organizationId: orgId,
      agentType,
      agentName: 'Loop Automation Agent',
      allowedTools: ['workflow.list', 'approval.submit'],
      accessibleKnowledgeSources: ['hr-policies'],
      writableResources: ['workflow_runs'],
      approvalLimits: { maxAmount: 5000 },
      escalationRules: { threshold: 10000 },
    });

    expect(perm.id).toBeTruthy();
    expect(perm.organizationId).toBe(orgId);
    expect(perm.agentType).toBe(agentType);
  });

  // ── 10. Agent canWrite check ──────────────────────────────────────────────
  it('10. Agent permission canWrite check returns boolean', async () => {
    const svc = new AgentPermissionService(pool);

    const agentType = `rw-agent-${crypto.randomUUID().slice(0, 8)}`;
    await svc.create({
      organizationId: orgId,
      agentType,
      agentName: 'Read-Write Agent',
      allowedTools: [],
      accessibleKnowledgeSources: [],
      writableResources: ['tasks'],
      approvalLimits: {},
      escalationRules: {},
    });

    const canWrite = await svc.canWrite(orgId, agentType, 'tasks');
    expect(typeof canWrite).toBe('boolean');
    expect(canWrite).toBe(true);
  });
});
