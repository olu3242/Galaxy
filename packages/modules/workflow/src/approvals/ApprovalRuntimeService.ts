import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalCategory =
  | 'finance'
  | 'hr'
  | 'security'
  | 'legal'
  | 'executive'
  | 'compliance'
  | 'general';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'delegated'
  | 'escalated'
  | 'timeout'
  | 'cancelled';

export type ApprovalDecision = 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  workflowRunId: string;
  stepId: string;
  category: ApprovalCategory;
  subject: string;
  description: string;
  requestedBy: string;
  assignedTo: string[];
  amount?: number;
  currency?: string;
  deadline?: string;
  escalateTo?: string;
  status: ApprovalStatus;
  decision?: ApprovalDecision;
  decidedBy?: string;
  decidedAt?: string;
  reason?: string;
  delegatedTo?: string;
  escalatedTo?: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  timeoutAt?: string;
}

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

interface ApprovalRequestRow {
  id: string;
  organization_id: string;
  workflow_run_id: string;
  step_id: string;
  category: string;
  subject: string;
  description: string;
  requested_by: string;
  assigned_to: string[];
  amount: number | null;
  currency: string | null;
  deadline: string | null;
  escalate_to: string | null;
  status: string;
  decision: string | null;
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;
  delegated_to: string | null;
  escalated_to: string | null;
  correlation_id: string;
  created_at: string;
  updated_at: string;
  timeout_at: string | null;
}

function rowToRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowRunId: row.workflow_run_id,
    stepId: row.step_id,
    category: row.category as ApprovalCategory,
    subject: row.subject,
    description: row.description,
    requestedBy: row.requested_by,
    assignedTo: row.assigned_to,
    correlationId: row.correlation_id,
    status: row.status as ApprovalStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.amount !== null ? { amount: row.amount } : {}),
    ...(row.currency !== null ? { currency: row.currency } : {}),
    ...(row.deadline !== null ? { deadline: row.deadline } : {}),
    ...(row.escalate_to !== null ? { escalateTo: row.escalate_to } : {}),
    ...(row.decision !== null ? { decision: row.decision as ApprovalDecision } : {}),
    ...(row.decided_by !== null ? { decidedBy: row.decided_by } : {}),
    ...(row.decided_at !== null ? { decidedAt: row.decided_at } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
    ...(row.delegated_to !== null ? { delegatedTo: row.delegated_to } : {}),
    ...(row.escalated_to !== null ? { escalatedTo: row.escalated_to } : {}),
    ...(row.timeout_at !== null ? { timeoutAt: row.timeout_at } : {}),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ApprovalRuntimeService {
  constructor(private readonly pool: Pool) {}

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  private async writeAuditLog(opts: {
    organizationId: string;
    actorId: string;
    action: string;
    resourceId: string;
    correlationId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs
         (organization_id, actor_type, actor_id, action, resource_type, resource_id,
          correlation_id, metadata)
       VALUES ($1, 'member', $2, $3, 'approval_request', $4, $5, $6)`,
      [
        opts.organizationId,
        opts.actorId,
        opts.action,
        opts.resourceId,
        opts.correlationId,
        JSON.stringify(opts.metadata),
      ],
    );
  }

  /**
   * Create an approval request and pause the associated workflow run.
   */
  async request(
    params: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<ApprovalRequest> {
    await this.setTenant(params.organizationId);

    const result = await this.pool.query<ApprovalRequestRow>(
      `INSERT INTO approval_requests
         (organization_id, workflow_run_id, step_id, category, subject, description,
          requested_by, assigned_to, amount, currency, deadline, escalate_to,
          status, correlation_id, timeout_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               'pending', $13, $14)
       RETURNING *`,
      [
        params.organizationId,
        params.workflowRunId,
        params.stepId,
        params.category,
        params.subject,
        params.description,
        params.requestedBy,
        params.assignedTo,
        params.amount ?? null,
        params.currency ?? null,
        params.deadline ?? null,
        params.escalateTo ?? null,
        params.correlationId,
        params.timeoutAt ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create approval request');

    // Pause the workflow run
    await this.pool.query(
      `UPDATE workflow_runs
       SET status = 'waiting', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2 AND status NOT IN ('completed', 'failed', 'cancelled')`,
      [params.organizationId, params.workflowRunId],
    );

    return rowToRequest(row);
  }

  /**
   * Approve or reject — only the assigned approver (or a delegate) can decide.
   */
  async decide(
    approvalId: string,
    actorId: string,
    decision: ApprovalDecision,
    reason?: string,
  ): Promise<ApprovalRequest> {
    // Fetch the approval to get organizationId and validate actor
    const fetchResult = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests WHERE id = $1`,
      [approvalId],
    );
    const existing = fetchResult.rows[0];
    if (!existing) throw new Error(`Approval request not found: ${approvalId}`);

    const { organization_id: organizationId } = existing;
    await this.setTenant(organizationId);

    if (existing.status !== 'pending' && existing.status !== 'delegated') {
      throw new Error(`Cannot decide approval in status: ${existing.status}`);
    }

    // Verify actor is authorised to decide
    const assignedTo: string[] = existing.assigned_to;
    const delegatedTo: string | null = existing.delegated_to;
    const isAssigned = assignedTo.includes(actorId) || delegatedTo === actorId;
    if (!isAssigned) {
      throw new Error(`Actor ${actorId} is not authorised to decide this approval`);
    }

    const result = await this.pool.query<ApprovalRequestRow>(
      `UPDATE approval_requests
       SET status = $2, decision = $2, decided_by = $3, decided_at = NOW(),
           reason = $4, updated_at = NOW()
       WHERE organization_id = $1 AND id = $5
       RETURNING *`,
      [organizationId, decision, actorId, reason ?? null, approvalId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Approval request not found: ${approvalId}`);

    // Resume (or complete/fail) the workflow run
    const newRunStatus = decision === 'approved' ? 'running' : 'failed';
    await this.pool.query(
      `UPDATE workflow_runs
       SET status = $2, updated_at = NOW()
       WHERE organization_id = $1 AND id = $3 AND status = 'waiting'`,
      [organizationId, newRunStatus, existing.workflow_run_id],
    );

    // Immutable audit log
    await this.writeAuditLog({
      organizationId,
      actorId,
      action: 'approval.decided',
      resourceId: approvalId,
      correlationId: existing.correlation_id,
      metadata: { decision, reason: reason ?? null },
    });

    return rowToRequest(row);
  }

  /**
   * Delegate to another member. The original approver stays in assignedTo for
   * visibility; decidedBy/delegatedTo is updated.
   */
  async delegate(
    approvalId: string,
    actorId: string,
    delegateTo: string,
    reason: string,
  ): Promise<ApprovalRequest> {
    const fetchResult = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests WHERE id = $1`,
      [approvalId],
    );
    const existing = fetchResult.rows[0];
    if (!existing) throw new Error(`Approval request not found: ${approvalId}`);

    const { organization_id: organizationId } = existing;
    await this.setTenant(organizationId);

    if (existing.status !== 'pending') {
      throw new Error(`Cannot delegate approval in status: ${existing.status}`);
    }

    const assignedTo: string[] = existing.assigned_to;
    if (!assignedTo.includes(actorId)) {
      throw new Error(`Actor ${actorId} is not assigned to this approval`);
    }

    const result = await this.pool.query<ApprovalRequestRow>(
      `UPDATE approval_requests
       SET status = 'delegated', delegated_to = $2, reason = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $4
       RETURNING *`,
      [organizationId, delegateTo, reason, approvalId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Approval request not found: ${approvalId}`);

    await this.writeAuditLog({
      organizationId,
      actorId,
      action: 'approval.delegated',
      resourceId: approvalId,
      correlationId: existing.correlation_id,
      metadata: { delegateTo, reason },
    });

    return rowToRequest(row);
  }

  /**
   * Escalate — moves to escalated status and records who it escalated to.
   */
  async escalate(approvalId: string, reason: string): Promise<ApprovalRequest> {
    const fetchResult = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests WHERE id = $1`,
      [approvalId],
    );
    const existing = fetchResult.rows[0];
    if (!existing) throw new Error(`Approval request not found: ${approvalId}`);

    const { organization_id: organizationId } = existing;
    await this.setTenant(organizationId);

    if (!['pending', 'delegated', 'timeout'].includes(existing.status)) {
      throw new Error(`Cannot escalate approval in status: ${existing.status}`);
    }

    const escalatedTo = existing.escalate_to;

    const result = await this.pool.query<ApprovalRequestRow>(
      `UPDATE approval_requests
       SET status = 'escalated', escalated_to = $2, reason = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $4
       RETURNING *`,
      [organizationId, escalatedTo, reason, approvalId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Approval request not found: ${approvalId}`);

    await this.writeAuditLog({
      organizationId,
      actorId: 'system',
      action: 'approval.escalated',
      resourceId: approvalId,
      correlationId: existing.correlation_id,
      metadata: { reason, escalatedTo },
    });

    return rowToRequest(row);
  }

  /**
   * Called by a scheduled worker every 5 minutes. Finds approvals past their
   * timeout_at and transitions them to 'timeout', then auto-escalates if an
   * escalate_to is configured.
   */
  async processTimeouts(): Promise<ApprovalRequest[]> {
    // Query without tenant filter — cross-org sweep; each row sets its own tenant
    const overdueResult = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE status IN ('pending', 'delegated')
         AND timeout_at IS NOT NULL
         AND timeout_at < NOW()
       ORDER BY timeout_at ASC
       LIMIT 200`,
    );

    const timedOut: ApprovalRequest[] = [];

    for (const row of overdueResult.rows) {
      const { organization_id: organizationId, id: approvalId, correlation_id: correlationId } =
        row;

      await this.setTenant(organizationId);

      const updated = await this.pool.query<ApprovalRequestRow>(
        `UPDATE approval_requests
         SET status = 'timeout', updated_at = NOW()
         WHERE organization_id = $1 AND id = $2 AND status IN ('pending', 'delegated')
         RETURNING *`,
        [organizationId, approvalId],
      );

      const updatedRow = updated.rows[0];
      if (!updatedRow) continue;

      await this.writeAuditLog({
        organizationId,
        actorId: 'system',
        action: 'approval.timeout',
        resourceId: approvalId,
        correlationId,
        metadata: { timeoutAt: row.timeout_at },
      });

      timedOut.push(rowToRequest(updatedRow));

      // Auto-escalate if escalate_to is configured
      if (updatedRow.escalate_to !== null) {
        try {
          await this.escalate(approvalId, 'Approval timed out — auto-escalated');
        } catch {
          // Non-fatal; timeout is already recorded
        }
      }
    }

    return timedOut;
  }

  /**
   * Get all pending approvals assigned to a specific actor within an org.
   */
  async getPending(organizationId: string, actorId: string): Promise<ApprovalRequest[]> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE organization_id = $1
         AND status IN ('pending', 'delegated')
         AND ($2 = ANY(assigned_to) OR delegated_to = $2)
       ORDER BY created_at ASC`,
      [organizationId, actorId],
    );

    return result.rows.map(rowToRequest);
  }

  /**
   * Get all approval requests for a workflow run (for history/audit views).
   */
  async getByWorkflowRun(
    organizationId: string,
    workflowRunId: string,
  ): Promise<ApprovalRequest[]> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests
       WHERE organization_id = $1 AND workflow_run_id = $2
       ORDER BY created_at ASC`,
      [organizationId, workflowRunId],
    );

    return result.rows.map(rowToRequest);
  }

  /**
   * Fetch a single approval request by id (scoped to org).
   */
  async getById(organizationId: string, approvalId: string): Promise<ApprovalRequest | null> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<ApprovalRequestRow>(
      `SELECT * FROM approval_requests WHERE organization_id = $1 AND id = $2`,
      [organizationId, approvalId],
    );

    const row = result.rows[0];
    return row !== undefined ? rowToRequest(row) : null;
  }
}

