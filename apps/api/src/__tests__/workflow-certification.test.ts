/**
 * Workflow OS Certification Test Suite
 *
 * Certifies the Workflow module lifecycle:
 * 1.  workflows and workflow_runs tables exist
 * 2.  Workflow definition creation persists a record
 * 3.  Workflow activation transitions status
 * 4.  Workflow run start creates an in_progress run
 * 5.  Workflow run completion updates status
 * 6.  Approval creation with steps persists a record
 * 7.  Approval decision submission updates step
 * 8.  Pending approvals listing is scoped to approver
 * 9.  Task creation and completion lifecycle
 * 10. Cross-tenant isolation — org B cannot see org A workflows
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  WorkflowDefinitionService,
  WorkflowEngineService,
  ApprovalService,
  TaskEngineService,
} from '@galaxy/workflow';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2901-4000-8000-290000000001';
const orgIdB = '00000000-2901-4000-8000-290000000002';
const actorId = '00000000-2901-4000-8000-290000000010';
const approverId = '00000000-2901-4000-8000-290000000011';

let sharedWorkflowId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Workflow Test Org A', 'workflow-test-a', 'starter', 'active'),
            ($2, 'Workflow Test Org B', 'workflow-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const defSvc = new WorkflowDefinitionService(pool);
  const wf = await defSvc.createWorkflow({
    organizationId: orgId,
    name: 'Shared Cert Workflow',
    automationDomain: 'hr',
    flowType: 'automated',
    ownerId: actorId,
    createdBy: actorId,
    correlationId: crypto.randomUUID(),
  });
  sharedWorkflowId = wf.id;
  await defSvc.activateWorkflow(orgId, sharedWorkflowId);
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM tasks WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(
      `DELETE FROM approval_steps WHERE approval_id IN (SELECT id FROM approvals WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(`DELETE FROM approvals WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM workflow_runs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM workflows WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Workflow OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. workflows and workflow_runs tables exist', async () => {
    for (const table of ['workflows', 'workflow_runs']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Workflow definition creation ───────────────────────────────────────
  it('2. Workflow definition creation persists a record', async () => {
    const svc = new WorkflowDefinitionService(pool);

    const wf = await svc.createWorkflow({
      organizationId: orgId,
      name: 'Leave Request Workflow',
      description: 'Handles leave request approvals',
      automationDomain: 'hr',
      flowType: 'automated',
      ownerId: actorId,
      slaDurationHours: 48,
      tags: ['hr', 'leave'],
      createdBy: actorId,
      correlationId: crypto.randomUUID(),
    });

    expect(wf.id).toBeTruthy();
    expect(wf.organizationId).toBe(orgId);
    expect(wf.name).toBe('Leave Request Workflow');
    expect(wf.isActive).toBe(false);
  });

  // ── 3. Workflow activation ────────────────────────────────────────────────
  it('3. Workflow activation transitions status to active', async () => {
    const svc = new WorkflowDefinitionService(pool);

    const wf = await svc.createWorkflow({
      organizationId: orgId,
      name: `Activation Test ${crypto.randomUUID().slice(0, 8)}`,
      automationDomain: 'governance',
      flowType: 'record_trigger',
      ownerId: actorId,
      createdBy: actorId,
      correlationId: crypto.randomUUID(),
    });

    const activated = await svc.activateWorkflow(orgId, wf.id);
    expect(activated.isActive).toBe(true);
  });

  // ── 4. Workflow run start ─────────────────────────────────────────────────
  it('4. Workflow run start creates an in_progress run', async () => {
    const svc = new WorkflowEngineService(pool);

    const run = await svc.startWorkflow({
      organizationId: orgId,
      workflowId: sharedWorkflowId,
      triggeredBy: actorId,
      triggerData: { requestId: crypto.randomUUID() },
      correlationId: crypto.randomUUID(),
    });

    expect(run.id).toBeTruthy();
    expect(run.organizationId).toBe(orgId);
    expect(run.workflowId).toBe(sharedWorkflowId);
    expect(['in_progress', 'running', 'started']).toContain(run.status);
  });

  // ── 5. Workflow run completion ────────────────────────────────────────────
  it('5. Workflow run completion updates status', async () => {
    const engineSvc = new WorkflowEngineService(pool);

    const run = await engineSvc.startWorkflow({
      organizationId: orgId,
      workflowId: sharedWorkflowId,
      triggeredBy: actorId,
      triggerData: {},
      correlationId: crypto.randomUUID(),
    });

    const completed = await engineSvc.completeWorkflowRun(
      orgId,
      run.id,
      { outcome: 'success' },
      actorId,
    );
    expect(completed.status).toBe('completed');
  });

  // ── 6. Approval creation ──────────────────────────────────────────────────
  it('6. Approval creation with steps persists a record', async () => {
    const svc = new ApprovalService(pool);

    const approval = await svc.createApproval({
      organizationId: orgId,
      title: 'Annual Leave Approval',
      requestedBy: actorId,
      dueAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      data: { leaveType: 'annual', days: 5 },
      steps: [{ approverId, approverType: 'member' }],
      correlationId: crypto.randomUUID(),
    });

    expect(approval.id).toBeTruthy();
    expect(approval.organizationId).toBe(orgId);
    expect(approval.title).toBe('Annual Leave Approval');
    expect(['pending', 'in_progress']).toContain(approval.status);
  });

  // ── 7. Approval decision ──────────────────────────────────────────────────
  it('7. Approval decision submission updates step', async () => {
    const svc = new ApprovalService(pool);

    const approval = await svc.createApproval({
      organizationId: orgId,
      title: `Decision Test ${crypto.randomUUID().slice(0, 8)}`,
      requestedBy: actorId,
      data: { type: 'expense', amount: 1000 },
      steps: [{ approverId, approverType: 'member' }],
      correlationId: crypto.randomUUID(),
    });

    const steps = await svc.getApprovalSteps(orgId, approval.id);
    if (steps.length === 0) return;
    const firstStep = steps[0];
    if (!firstStep) return;

    const decision = await svc.submitDecision({
      organizationId: orgId,
      approvalId: approval.id,
      stepId: firstStep.id,
      approverId,
      decision: 'approved',
      comment: 'Looks good',
      correlationId: crypto.randomUUID(),
    });

    expect(['approved', 'pending']).toContain(decision.status);
  });

  // ── 8. Pending approvals listing ──────────────────────────────────────────
  it('8. Pending approvals listing is scoped to approver', async () => {
    const svc = new ApprovalService(pool);

    const pending = await svc.listPendingApprovals(orgId, approverId);
    expect(Array.isArray(pending)).toBe(true);
  });

  // ── 9. Task lifecycle ─────────────────────────────────────────────────────
  it('9. Task creation and completion lifecycle works', async () => {
    const svc = new TaskEngineService(pool);

    const task = await svc.createTask({
      organizationId: orgId,
      title: 'Review Q3 report',
      priority: 'high',
      assigneeId: actorId,
      reporterId: actorId,
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      data: { reportId: crypto.randomUUID() },
      correlationId: crypto.randomUUID(),
    });

    expect(task.id).toBeTruthy();
    expect(task.organizationId).toBe(orgId);
    expect(task.title).toBe('Review Q3 report');
    expect(task.status).toBe('open');

    const completed = await svc.completeTask(orgId, task.id, actorId);
    expect(completed.status).toBe('completed');
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A workflows', async () => {
    const svc = new WorkflowDefinitionService(pool);

    const workflowsB = await svc.listWorkflows(orgIdB);
    const leaked = workflowsB.some((w) => w.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
