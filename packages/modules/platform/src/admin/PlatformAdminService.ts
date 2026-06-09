import type { Pool } from 'pg';

export interface AdminActionRecord {
  id: string;
  adminId: string;
  actionType: string;
  payload: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
}

export interface PlatformMetricRecord {
  id: string;
  metricName: string;
  value: number;
  labels: Record<string, unknown>;
  recordedAt: string;
}

interface AdminActionRow {
  id: string;
  admin_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  notes: string | null;
  created_at: string;
}

interface PlatformMetricRow {
  id: string;
  metric_name: string;
  value: string;
  labels: Record<string, unknown>;
  recorded_at: string;
}

export class PlatformAdminService {
  constructor(private readonly pool: Pool) {}

  async recordAdminAction(input: {
    adminId: string;
    actionType: string;
    payload: Record<string, unknown>;
    notes?: string;
  }): Promise<AdminActionRecord> {
    const result = await this.pool.query<AdminActionRow>(
      `INSERT INTO platform_admin_actions (admin_id, action_type, payload, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.adminId, input.actionType, JSON.stringify(input.payload), input.notes ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to insert admin action');
    return this.mapAction(row);
  }

  async listAdminActions(opts?: {
    adminId?: string;
    actionType?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminActionRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.adminId !== undefined) {
      conditions.push(`admin_id = $${String(idx++)}`);
      params.push(opts.adminId);
    }
    if (opts?.actionType !== undefined) {
      conditions.push(`action_type = $${String(idx++)}`);
      params.push(opts.actionType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);
    const offset = opts?.offset !== undefined ? ` OFFSET $${String(idx++)}` : '';
    if (opts?.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<AdminActionRow>(
      `SELECT * FROM platform_admin_actions ${where} ORDER BY created_at DESC${limit}${offset}`,
      params,
    );
    return result.rows.map((r) => this.mapAction(r));
  }

  async recordMetric(input: {
    metricName: string;
    value: number;
    labels?: Record<string, unknown>;
  }): Promise<PlatformMetricRecord> {
    const result = await this.pool.query<PlatformMetricRow>(
      `INSERT INTO platform_admin_metrics (metric_name, value, labels)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.metricName, input.value, JSON.stringify(input.labels ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to insert platform metric');
    return this.mapMetric(row);
  }

  async getMetrics(opts?: {
    metricName?: string;
    limit?: number;
  }): Promise<PlatformMetricRecord[]> {
    const params: unknown[] = [];
    let idx = 1;
    const where = opts?.metricName !== undefined ? `WHERE metric_name = $${String(idx++)}` : '';
    if (opts?.metricName !== undefined) params.push(opts.metricName);
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<PlatformMetricRow>(
      `SELECT * FROM platform_admin_metrics ${where} ORDER BY recorded_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapMetric(r));
  }

  private mapAction(row: AdminActionRow): AdminActionRecord {
    return {
      id: row.id,
      adminId: row.admin_id,
      actionType: row.action_type,
      payload: row.payload,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  private mapMetric(row: PlatformMetricRow): PlatformMetricRecord {
    return {
      id: row.id,
      metricName: row.metric_name,
      value: parseFloat(row.value),
      labels: row.labels,
      recordedAt: row.recorded_at,
    };
  }
}
