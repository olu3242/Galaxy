import type { Pool } from 'pg';
import type { FailureRecord, FailureCategory, FailureSeverity, FailureStatus } from './types.js';

interface FailureRow {
  id: string;
  organization_id: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  context: Record<string, unknown>;
  recovery_rule_id: string | null;
  resolved_by: string | null;
  detected_at: Date;
  resolved_at: Date | null;
}

function rowToFailure(row: FailureRow): FailureRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category as FailureCategory,
    severity: row.severity as FailureSeverity,
    status: row.status as FailureStatus,
    description: row.description,
    context: row.context,
    detectedAt: row.detected_at,
    ...(row.recovery_rule_id !== null ? { recoveryRuleId: row.recovery_rule_id } : {}),
    ...(row.resolved_by !== null ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

export class FailureRegistryService {
  constructor(private readonly pool: Pool) {}

  async recordFailure(
    orgId: string,
    category: FailureCategory,
    severity: FailureSeverity,
    description: string,
    context?: Record<string, unknown>,
  ): Promise<FailureRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<FailureRow>(
      `INSERT INTO failure_records (organization_id, category, severity, description, context)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, category, severity, description, JSON.stringify(context ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record failure');
    return rowToFailure(row);
  }

  async listFailures(
    orgId: string,
    category?: FailureCategory,
    status?: FailureStatus,
    limit = 100,
  ): Promise<FailureRecord[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const params: unknown[] = [orgId];
    const conditions: string[] = ['organization_id = $1'];
    if (category !== undefined) {
      params.push(category);
      conditions.push(`category = $${String(params.length)}`);
    }
    if (status !== undefined) {
      params.push(status);
      conditions.push(`status = $${String(params.length)}`);
    }
    params.push(limit);
    const result = await this.pool.query<FailureRow>(
      `SELECT * FROM failure_records WHERE ${conditions.join(' AND ')} ORDER BY detected_at DESC LIMIT $${String(params.length)}`,
      params,
    );
    return result.rows.map(rowToFailure);
  }

  async resolveFailure(
    orgId: string,
    failureId: string,
    resolvedBy: string,
  ): Promise<FailureRecord> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<FailureRow>(
      `UPDATE failure_records SET status = 'recovered', resolved_by = $3, resolved_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, failureId, resolvedBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failure record not found');
    return rowToFailure(row);
  }

  async getFailureMetrics(orgId: string): Promise<Record<string, unknown>> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<{ category: string; status: string; count: string }>(
      `SELECT category, status, COUNT(*) as count FROM failure_records
       WHERE organization_id = $1 GROUP BY category, status`,
      [orgId],
    );
    const metrics: Record<string, Record<string, number>> = {};
    for (const row of result.rows) {
      const cat = row.category;
      const st = row.status;
      if (!metrics[cat]) metrics[cat] = {};
      const catMetrics = metrics[cat];
      if (catMetrics !== undefined) catMetrics[st] = parseInt(row.count, 10);
    }
    return metrics;
  }
}
