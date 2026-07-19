import type { Pool } from 'pg';
import type { EscalationRecord, EscalationType, EscalationStatus } from './types.js';

interface EscalationRow {
  id: string;
  organization_id: string;
  escalation_type: string;
  status: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  escalated_to: string;
  escalated_by: string;
  due_at: Date | null;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  created_at: Date;
}

function rowToEscalation(row: EscalationRow): EscalationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    escalationType: row.escalation_type as EscalationType,
    status: row.status as EscalationStatus,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    reason: row.reason,
    escalatedTo: row.escalated_to,
    escalatedBy: row.escalated_by,
    createdAt: row.created_at,
    ...(row.due_at !== null ? { dueAt: row.due_at } : {}),
    ...(row.acknowledged_at !== null ? { acknowledgedAt: row.acknowledged_at } : {}),
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

export class EscalationService {
  constructor(private readonly pool: Pool) {}

  async escalate(
    orgId: string,
    escalationType: EscalationType,
    resourceType: string,
    resourceId: string,
    reason: string,
    escalatedTo: string,
    escalatedBy: string,
    dueAt?: Date,
  ): Promise<EscalationRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<EscalationRow>(
      `INSERT INTO escalation_records
         (organization_id, escalation_type, resource_type, resource_id, reason, escalated_to, escalated_by, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        orgId,
        escalationType,
        resourceType,
        resourceId,
        reason,
        escalatedTo,
        escalatedBy,
        dueAt ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create escalation');
    return rowToEscalation(row);
  }

  async acknowledge(orgId: string, escalationId: string): Promise<EscalationRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<EscalationRow>(
      `UPDATE escalation_records SET status = 'acknowledged', acknowledged_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, escalationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Escalation not found');
    return rowToEscalation(row);
  }

  async resolve(orgId: string, escalationId: string): Promise<EscalationRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<EscalationRow>(
      `UPDATE escalation_records SET status = 'resolved', resolved_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, escalationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Escalation not found');
    return rowToEscalation(row);
  }

  async listEscalations(
    orgId: string,
    status?: EscalationStatus,
    limit = 100,
  ): Promise<EscalationRecord[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const params: unknown[] = [orgId];
    const cond = status !== undefined ? ` AND status = $${String(params.push(status))}` : '';
    params.push(limit);
    const result = await this.pool.query<EscalationRow>(
      `SELECT * FROM escalation_records WHERE organization_id = $1${cond} ORDER BY created_at DESC LIMIT $${String(params.length)}`,
      params,
    );
    return result.rows.map(rowToEscalation);
  }

  async checkTimeouts(orgId: string): Promise<number> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<{ count: string }>(
      `UPDATE escalation_records SET status = 'timed_out'
       WHERE organization_id = $1 AND status = 'pending' AND due_at < NOW()
       RETURNING id`,
      [orgId],
    );
    return result.rowCount ?? 0;
  }
}
