import type { Pool } from 'pg';
import type { AdminAction, AdminActionType } from '../types.js';

interface AdminActionRow {
  id: string;
  admin_id: string;
  action_type: string;
  target_tenant_id: string | null;
  payload: Record<string, unknown>;
  reason: string | null;
  performed_at: string;
}

function mapAction(row: AdminActionRow): AdminAction {
  return {
    id: row.id,
    adminId: row.admin_id,
    actionType: row.action_type as AdminActionType,
    targetTenantId: row.target_tenant_id,
    payload: row.payload,
    reason: row.reason,
    performedAt: row.performed_at,
  };
}

export interface LogAdminActionInput {
  adminId: string;
  actionType: AdminActionType;
  payload: Record<string, unknown>;
  targetTenantId?: string;
  reason?: string;
}

export class AdminActionLogService {
  constructor(private readonly pool: Pool) {}

  async logAction(input: LogAdminActionInput): Promise<AdminAction> {
    const result = await this.pool.query<AdminActionRow>(
      `INSERT INTO admin_action_logs (admin_id, action_type, target_tenant_id, payload, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.adminId,
        input.actionType,
        input.targetTenantId ?? null,
        JSON.stringify(input.payload),
        input.reason ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO admin_action_logs returned no row');
    return mapAction(row);
  }

  async listActions(opts?: {
    adminId?: string;
    actionType?: AdminActionType;
    targetTenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminAction[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.adminId !== undefined) {
      conditions.push(`admin_id = $${String(idx)}`);
      params.push(opts.adminId);
      idx++;
    }
    if (opts?.actionType !== undefined) {
      conditions.push(`action_type = $${String(idx)}`);
      params.push(opts.actionType);
      idx++;
    }
    if (opts?.targetTenantId !== undefined) {
      conditions.push(`target_tenant_id = $${String(idx)}`);
      params.push(opts.targetTenantId);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts?.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
      idx++;
    }
    const offsetClause = opts?.offset !== undefined ? ` OFFSET $${String(idx)}` : '';
    if (opts?.offset !== undefined) {
      params.push(opts.offset);
    }

    const result = await this.pool.query<AdminActionRow>(
      `SELECT * FROM admin_action_logs ${whereClause} ORDER BY performed_at DESC${limitClause}${offsetClause}`,
      params,
    );

    return result.rows.map(mapAction);
  }

  async getAction(actionId: string): Promise<AdminAction | null> {
    const result = await this.pool.query<AdminActionRow>(
      `SELECT * FROM admin_action_logs WHERE id = $1`,
      [actionId],
    );

    return result.rows[0] ? mapAction(result.rows[0]) : null;
  }
}
