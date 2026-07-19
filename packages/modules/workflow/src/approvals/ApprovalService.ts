import type { Pool } from 'pg';
import type {
  Approval,
  ApprovalDecisionInput,
  ApprovalStatus,
  ApprovalStep,
  CreateApprovalInput,
} from '../types.js';

interface ApprovalRow {
  id: string;
  organization_id: string;
  workflow_run_id: string | null;
  title: string;
  description: string | null;
  status: string;
  requested_by: string;
  current_step_order: number;
  due_at: string | null;
  completed_at: string | null;
  data: Record<string, unknown>;
  correlation_id: string;
  created_at: string;
  updated_at: string;
}

interface ApprovalStepRow {
  id: string;
  organization_id: string;
  approval_id: string;
  step_order: number;
  approver_id: string;
  approver_type: string;
  status: string;
  due_at: string | null;
  decided_at: string | null;
  created_at: string;
}

function rowToApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    status: row.status as ApprovalStatus,
    requestedBy: row.requested_by,
    currentStepOrder: row.current_step_order,
    data: row.data,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.workflow_run_id !== null ? { workflowRunId: row.workflow_run_id } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.due_at !== null ? { dueAt: row.due_at } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

function rowToApprovalStep(row: ApprovalStepRow): ApprovalStep {
  return {
    id: row.id,
    organizationId: row.organization_id,
    approvalId: row.approval_id,
    stepOrder: row.step_order,
    approverId: row.approver_id,
    approverType: row.approver_type as ApprovalStep['approverType'],
    status: row.status as ApprovalStep['status'],
    createdAt: row.created_at,
    ...(row.due_at !== null ? { dueAt: row.due_at } : {}),
    ...(row.decided_at !== null ? { decidedAt: row.decided_at } : {}),
  };
}

export class ApprovalService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createApproval(input: CreateApprovalInput): Promise<Approval> {
    await this.setTenantContext(input.organizationId);

    const approvalResult = await this.pool.query<ApprovalRow>(
      `INSERT INTO approvals
         (organization_id, workflow_run_id, title, description, status,
          requested_by, current_step_order, due_at, data, correlation_id)
       VALUES ($1, $2, $3, $4, 'pending', $5, 1, $6, $7, $8)
       RETURNING *`,
      [
        input.organizationId,
        input.workflowRunId ?? null,
        input.title,
        input.description ?? null,
        input.requestedBy,
        input.dueAt ?? null,
        JSON.stringify(input.data ?? {}),
        input.correlationId,
      ],
    );

    const approvalRow = approvalResult.rows[0];
    if (!approvalRow) throw new Error('INSERT INTO approvals RETURNING returned no row');

    const approvalId = approvalRow.id;

    for (let i = 0; i < input.steps.length; i++) {
      const step = input.steps[i];
      if (!step) continue;
      await this.pool.query(
        `INSERT INTO approval_steps
           (organization_id, approval_id, step_order, approver_id, approver_type,
            status, due_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [
          input.organizationId,
          approvalId,
          i + 1,
          step.approverId,
          step.approverType,
          step.dueAt ?? null,
        ],
      );
    }

    await this.pool.query(
      `INSERT INTO approval_history
         (organization_id, approval_id, to_status, actor_type, actor_id)
       VALUES ($1, $2, 'pending', 'system', 'engine')`,
      [input.organizationId, approvalId],
    );

    return rowToApproval(approvalRow);
  }

  async getApproval(organizationId: string, approvalId: string): Promise<Approval | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<ApprovalRow>(
      `SELECT * FROM approvals WHERE organization_id = $1 AND id = $2`,
      [organizationId, approvalId],
    );

    const row = result.rows[0];
    return row !== undefined ? rowToApproval(row) : null;
  }

  async getApprovalSteps(organizationId: string, approvalId: string): Promise<ApprovalStep[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<ApprovalStepRow>(
      `SELECT * FROM approval_steps
       WHERE organization_id = $1 AND approval_id = $2
       ORDER BY step_order ASC`,
      [organizationId, approvalId],
    );

    return result.rows.map(rowToApprovalStep);
  }

  async submitDecision(input: ApprovalDecisionInput): Promise<Approval> {
    await this.setTenantContext(input.organizationId);

    // Update the specific step
    await this.pool.query(
      `UPDATE approval_steps
       SET status = $3, decided_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [input.organizationId, input.stepId, input.decision],
    );

    // Record decision
    await this.pool.query(
      `INSERT INTO approval_decisions
         (organization_id, approval_id, step_id, approver_id, decision, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.organizationId,
        input.approvalId,
        input.stepId,
        input.approverId,
        input.decision,
        input.comment ?? null,
      ],
    );

    if (input.decision === 'rejected') {
      const result = await this.pool.query<ApprovalRow>(
        `UPDATE approvals
         SET status = 'rejected', completed_at = NOW(), updated_at = NOW()
         WHERE organization_id = $1 AND id = $2
         RETURNING *`,
        [input.organizationId, input.approvalId],
      );

      const row = result.rows[0];
      if (!row) throw new Error(`Approval not found: ${input.approvalId}`);

      await this.pool.query(
        `INSERT INTO approval_history
           (organization_id, approval_id, from_status, to_status, actor_type, actor_id)
         VALUES ($1, $2, 'pending', 'rejected', 'member', $3)`,
        [input.organizationId, input.approvalId, input.approverId],
      );

      return rowToApproval(row);
    }

    // decision === 'approved': check if more pending steps remain
    const pendingResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM approval_steps
       WHERE organization_id = $1 AND approval_id = $2 AND status = 'pending'`,
      [input.organizationId, input.approvalId],
    );

    const pendingCount = parseInt(pendingResult.rows[0]?.count ?? '0', 10);

    if (pendingCount === 0) {
      // All steps approved — finalise
      const result = await this.pool.query<ApprovalRow>(
        `UPDATE approvals
         SET status = 'approved', completed_at = NOW(), updated_at = NOW()
         WHERE organization_id = $1 AND id = $2
         RETURNING *`,
        [input.organizationId, input.approvalId],
      );

      const row = result.rows[0];
      if (!row) throw new Error(`Approval not found: ${input.approvalId}`);

      await this.pool.query(
        `INSERT INTO approval_history
           (organization_id, approval_id, from_status, to_status, actor_type, actor_id)
         VALUES ($1, $2, 'pending', 'approved', 'member', $3)`,
        [input.organizationId, input.approvalId, input.approverId],
      );

      return rowToApproval(row);
    }

    // More steps remain — advance current_step_order
    const result = await this.pool.query<ApprovalRow>(
      `UPDATE approvals
       SET current_step_order = current_step_order + 1, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [input.organizationId, input.approvalId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Approval not found: ${input.approvalId}`);

    await this.pool.query(
      `INSERT INTO approval_history
         (organization_id, approval_id, from_status, to_status, actor_type, actor_id, notes)
       VALUES ($1, $2, 'pending', 'pending', 'member', $3, 'Step approved; advancing to next step')`,
      [input.organizationId, input.approvalId, input.approverId],
    );

    return rowToApproval(row);
  }

  async escalateApproval(
    organizationId: string,
    approvalId: string,
    reason: string,
  ): Promise<Approval> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<ApprovalRow>(
      `UPDATE approvals
       SET status = 'escalated', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, approvalId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Approval not found: ${approvalId}`);

    await this.pool.query(
      `INSERT INTO approval_history
         (organization_id, approval_id, from_status, to_status, actor_type, actor_id, notes)
       VALUES ($1, $2, 'pending', 'escalated', 'system', 'engine', $3)`,
      [organizationId, approvalId, reason],
    );

    return rowToApproval(row);
  }

  async listPendingApprovals(organizationId: string, approverId: string): Promise<Approval[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<ApprovalRow>(
      `SELECT DISTINCT a.*
       FROM approvals a
       JOIN approval_steps s ON s.approval_id = a.id
       WHERE a.organization_id = $1
         AND a.status = 'pending'
         AND s.approver_id = $2
         AND s.status = 'pending'
       ORDER BY a.created_at ASC`,
      [organizationId, approverId],
    );

    return result.rows.map(rowToApproval);
  }
}
