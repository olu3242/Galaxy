import type { Pool } from 'pg';
import { z } from 'zod';
import type { Metric, MetricPeriod, MetricRow } from '../types.js';

const RecordMetricSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  value: z.number(),
  unit: z.string().min(1).max(50),
  period: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  dimensions: z.record(z.string()).optional().default({}),
});

export type RecordMetricInput = z.input<typeof RecordMetricSchema> & {
  organizationId: string;
};

function rowToMetric(row: MetricRow): Metric {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    category: row.category,
    value: parseFloat(row.value),
    unit: row.unit,
    period: row.period as MetricPeriod,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dimensions: row.dimensions,
    createdAt: row.created_at,
  };
}

export class MetricsService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async recordMetric(input: RecordMetricInput): Promise<Metric> {
    const parsed = RecordMetricSchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<MetricRow>(
      `INSERT INTO metrics
         (organization_id, name, category, value, unit, period, period_start, period_end, dimensions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.organizationId,
        parsed.name,
        parsed.category,
        parsed.value,
        parsed.unit,
        parsed.period,
        parsed.periodStart,
        parsed.periodEnd,
        JSON.stringify(parsed.dimensions),
      ],
    );

    return rowToMetric(result.rows[0]!);
  }

  async getMetrics(
    organizationId: string,
    options: { category?: string; period?: MetricPeriod; limit?: number; offset?: number } = {},
  ): Promise<Metric[]> {
    await this.setTenantContext(organizationId);

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (options.category) {
      conditions.push(`category = $${idx++}`);
      params.push(options.category);
    }
    if (options.period) {
      conditions.push(`period = $${idx++}`);
      params.push(options.period);
    }

    params.push(options.limit ?? 100);
    params.push(options.offset ?? 0);

    const result = await this.pool.query<MetricRow>(
      `SELECT * FROM metrics WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );

    return result.rows.map(rowToMetric);
  }

  async aggregateMetrics(
    organizationId: string,
    metricName: string,
    period: MetricPeriod,
  ): Promise<{ period: string; avg: number; min: number; max: number; count: number }[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<{
      period_start: string;
      avg: string;
      min: string;
      max: string;
      count: string;
    }>(
      `SELECT period_start,
              AVG(value) as avg,
              MIN(value) as min,
              MAX(value) as max,
              COUNT(*) as count
       FROM metrics
       WHERE organization_id = $1 AND name = $2 AND period = $3
       GROUP BY period_start
       ORDER BY period_start DESC`,
      [organizationId, metricName, period],
    );

    return result.rows.map((r) => ({
      period: r.period_start,
      avg: parseFloat(r.avg),
      min: parseFloat(r.min),
      max: parseFloat(r.max),
      count: parseInt(r.count, 10),
    }));
  }
}
