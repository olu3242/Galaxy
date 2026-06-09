import type { Pool } from 'pg';
import type {
  GovernanceActionType,
  GovernanceApprovalRequest,
  GovernanceApprovalStatus,
} from './types.js';

// Actions Galaxy MAY NOT perform without human approval
export const RESTRICTED_ACTIONS = new Set<GovernanceActionType>([
  'terminate_employee',
  'transfer_funds',
  'approve_legal_agreement',
  'override_policy',
  'execute_governance_exception',
  'modify_executive_role',
]);

interface ApprovalRow {
  id: string;
  organization_id: string;
  action_type: string;
  requested_by: string;
  resource_type: string;
  resource_id: string;
  context: Record<string, unknown>;
  status: string;
  approved_by: string | null;
  approval_note: string | null;
  expires_at: Date;
  created_at: Date;
  resolved_at: Date | null;
}

function rowToApproval(row: ApprovalRow): GovernanceApprovalRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actionType: row.action_type as GovernanceActionType,
    requestedBy: row.requested_by,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    context: row.context,
    status: row.status as GovernanceApprovalStatus,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    ...(row.approved_by !== null ? { approvedBy: row.approved_by } : {}),
    ...(row.approval_note !== null ? { approvalNote: row.approval_note } : {}),
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

export class GovernanceEnforcementService {
  constructor(private readonly pool: Pool) {}

  isRestricted(actionType: GovernanceActionType): boolean {
    return RESTRICTED_ACTIONS.has(actionType);
  }

  async requestApproval(
    orgId: string,
    actionType: GovernanceActionType,
    requestedBy: string,
    resourceType: string,
    resourceId: string,
    context?: Record<string, unknown>,
  ): Promise<GovernanceApprovalRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    if (!this.isRestricted(actionType)) {
      throw new Error(`Action type '${actionType}' does not require governance approval`);
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await this.pool.query<ApprovalRow>(
      `INSERT INTO governance_approvals
         (organization_id, action_type, requested_by, resource_type, resource_id, context, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        orgId,
        actionType,
        requestedBy,
        resourceType,
        resourceId,
        JSON.stringify(context ?? {}),
        expiresAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create governance approval request');
    return rowToApproval(row);
  }

  async approve(
    orgId: string,
    approvalId: string,
    approvedBy: string,
    note?: string,
  ): Promise<GovernanceApprovalRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ApprovalRow>(
      `UPDATE governance_approvals
       SET status = 'approved', approved_by = $3, approval_note = $4, resolved_at = NOW()
       WHERE organization_id = $1 AND id = $2 AND status = 'pending' AND expires_at > NOW()
       RETURNING *`,
      [orgId, approvalId, approvedBy, note ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Approval request not found, already resolved, or expired');
    return rowToApproval(row);
  }

  async reject(
    orgId: string,
    approvalId: string,
    rejectedBy: string,
    note?: string,
  ): Promise<GovernanceApprovalRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ApprovalRow>(
      `UPDATE governance_approvals
       SET status = 'rejected', approved_by = $3, approval_note = $4, resolved_at = NOW()
       WHERE organization_id = $1 AND id = $2 AND status = 'pending'
       RETURNING *`,
      [orgId, approvalId, rejectedBy, note ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Approval request not found or already resolved');
    return rowToApproval(row);
  }

  async listPendingApprovals(orgId: string): Promise<GovernanceApprovalRequest[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ApprovalRow>(
      `SELECT * FROM governance_approvals
       WHERE organization_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [orgId],
    );
    return result.rows.map(rowToApproval);
  }

  async expireStale(orgId: string): Promise<number> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query(
      `UPDATE governance_approvals SET status = 'expired', resolved_at = NOW()
       WHERE organization_id = $1 AND status = 'pending' AND expires_at < NOW()`,
      [orgId],
    );
    return result.rowCount ?? 0;
  }
}
