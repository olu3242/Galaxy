import type { Pool } from 'pg';
import type { MetricPoint, MetricPointRow } from '../types.js';

function rowToMetric(row: MetricPointRow): MetricPoint {
  return {
    id: row.id,
    organizationId: row.organization_id,
    metricName: row.metric_name,
    metricValue: parseFloat(row.metric_value),
    labels: row.labels,
    timestamp: row.timestamp,
  };
}

export interface RecordMetricInput {
  organizationId: string;
  metricName: string;
  metricValue: number;
  labels: Record<string, string>;
  timestamp?: string;
}

export interface MetricQuery {
  metricName: string;
  from: string;
  to: string;
  labels?: Record<string, string>;
  limit?: number;
}

export class MetricsCollectorService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async record(input: RecordMetricInput): Promise<MetricPoint> {
    await this.setTenantContext(input.organizationId);
    const ts = input.timestamp ?? new Date().toISOString();
    const result = await this.pool.query<MetricPointRow>(
      `INSERT INTO operational_metrics (organization_id, metric_name, metric_value, labels, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.organizationId, input.metricName, input.metricValue, JSON.stringify(input.labels), ts],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record metric');
    return rowToMetric(row);
  }

  async query(organizationId: string, q: MetricQuery): Promise<MetricPoint[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId, q.metricName, q.from, q.to];
    let sql = `SELECT * FROM operational_metrics
               WHERE organization_id = $1 AND metric_name = $2
                 AND timestamp >= $3 AND timestamp <= $4`;

    if (q.labels !== undefined) {
      params.push(JSON.stringify(q.labels));
      sql += ` AND labels @> $${String(params.length)}::jsonb`;
    }

    sql += ' ORDER BY timestamp DESC';

    if (q.limit !== undefined) {
      params.push(q.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }

    const result = await this.pool.query<MetricPointRow>(sql, params);
    return result.rows.map(rowToMetric);
  }

  async getLatestValue(organizationId: string, metricName: string): Promise<MetricPoint | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MetricPointRow>(
      `SELECT * FROM operational_metrics
       WHERE organization_id = $1 AND metric_name = $2
       ORDER BY timestamp DESC
       LIMIT 1`,
      [organizationId, metricName],
    );
    const row = result.rows[0];
    return row ? rowToMetric(row) : null;
  }

  async aggregate(
    organizationId: string,
    metricName: string,
    from: string,
    to: string,
    fn: 'avg' | 'sum' | 'min' | 'max' | 'count',
  ): Promise<number> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<{ value: string }>(
      `SELECT ${fn}(metric_value::numeric) AS value
       FROM operational_metrics
       WHERE organization_id = $1 AND metric_name = $2
         AND timestamp >= $3 AND timestamp <= $4`,
      [organizationId, metricName, from, to],
    );
    const row = result.rows[0];
    return row ? parseFloat(row.value) : 0;
  }
}
