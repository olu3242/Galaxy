import type { Pool } from 'pg';
import { z } from 'zod';
import type { KPI, KPIRow, KPIStatus, MetricPeriod } from '../types.js';

const SetKPISchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  metricName: z.string().min(1).max(200),
  targetValue: z.number(),
  unit: z.string().min(1).max(50),
  period: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  ownerId: z.string().uuid(),
});

export type SetKPIInput = z.input<typeof SetKPISchema> & { organizationId: string };

function rowToKPI(row: KPIRow): KPI {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    metricName: row.metric_name,
    targetValue: parseFloat(row.target_value),
    currentValue: parseFloat(row.current_value),
    unit: row.unit,
    period: row.period as MetricPeriod,
    status: row.status as KPIStatus,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KPIService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async setKPI(input: SetKPIInput): Promise<KPI> {
    const parsed = SetKPISchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<KPIRow>(
      `INSERT INTO kpis
         (organization_id, name, description, metric_name, target_value, unit, period, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id, name)
       DO UPDATE SET
         description = EXCLUDED.description,
         target_value = EXCLUDED.target_value,
         unit = EXCLUDED.unit,
         period = EXCLUDED.period,
         owner_id = EXCLUDED.owner_id,
         updated_at = NOW()
       RETURNING *`,
      [
        input.organizationId,
        parsed.name,
        parsed.description,
        parsed.metricName,
        parsed.targetValue,
        parsed.unit,
        parsed.period,
        parsed.ownerId,
      ],
    );

    return rowToKPI(result.rows[0]!);
  }

  async getKPIs(organizationId: string): Promise<KPI[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KPIRow>(
      'SELECT * FROM kpis WHERE organization_id = $1 ORDER BY name ASC',
      [organizationId],
    );

    return result.rows.map(rowToKPI);
  }

  async evaluateKPI(organizationId: string, kpiId: string, currentValue: number): Promise<KPI> {
    await this.setTenantContext(organizationId);

    const kpiResult = await this.pool.query<KPIRow>(
      'SELECT * FROM kpis WHERE id = $1 AND organization_id = $2',
      [kpiId, organizationId],
    );

    const kpiRow = kpiResult.rows[0];
    if (!kpiRow) {
      throw new Error(`KPI ${kpiId} not found`);
    }

    const target = parseFloat(kpiRow.target_value);
    const ratio = currentValue / target;
    let status: KPIStatus;
    if (ratio >= 0.95) {
      status = 'on_track';
    } else if (ratio >= 0.75) {
      status = 'at_risk';
    } else {
      status = 'off_track';
    }

    const updated = await this.pool.query<KPIRow>(
      `UPDATE kpis
       SET current_value = $1, status = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING *`,
      [currentValue, status, kpiId, organizationId],
    );

    return rowToKPI(updated.rows[0]!);
  }
}
