import type { Pool } from 'pg';

export interface PlatformMetric {
  id: string;
  metricName: string;
  value: number;
  labels: Record<string, unknown>;
  recordedAt: string;
}

interface PlatformMetricRow {
  id: string;
  metric_name: string;
  value: string;
  labels: Record<string, unknown>;
  recorded_at: string;
}

export class MetricsService {
  constructor(private readonly pool: Pool) {}

  async record(input: {
    metricName: string;
    value: number;
    labels?: Record<string, unknown>;
  }): Promise<PlatformMetric> {
    const result = await this.pool.query<PlatformMetricRow>(
      `INSERT INTO platform_metrics (metric_name, value, labels)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.metricName, input.value, JSON.stringify(input.labels ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record metric');
    return this.mapMetric(row);
  }

  async query(opts?: {
    metricName?: string;
    since?: Date;
    limit?: number;
  }): Promise<PlatformMetric[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.metricName !== undefined) {
      conditions.push(`metric_name = $${String(idx++)}`);
      params.push(opts.metricName);
    }
    if (opts?.since !== undefined) {
      conditions.push(`recorded_at >= $${String(idx++)}`);
      params.push(opts.since.toISOString());
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<PlatformMetricRow>(
      `SELECT * FROM platform_metrics ${where} ORDER BY recorded_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapMetric(r));
  }

  private mapMetric(row: PlatformMetricRow): PlatformMetric {
    return {
      id: row.id,
      metricName: row.metric_name,
      value: parseFloat(row.value),
      labels: row.labels,
      recordedAt: row.recorded_at,
    };
  }
}
