import type { Pool } from 'pg';

export interface UsageLimit {
  id: string;
  organizationId: string;
  resourceType: string;
  limitValue: number;
  resetPeriod: string;
  createdAt: string;
}

export interface UsageAlert {
  id: string;
  organizationId: string;
  resourceType: string;
  thresholdPct: number;
  triggeredAt: string | null;
  createdAt: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  percentUsed: number;
}

interface UsageLimitRow {
  id: string;
  organization_id: string;
  resource_type: string;
  limit_value: string;
  reset_period: string;
  created_at: string;
}

interface UsageAlertRow {
  id: string;
  organization_id: string;
  resource_type: string;
  threshold_pct: string;
  triggered_at: string | null;
  created_at: string;
}

export class QuotaService {
  constructor(private readonly pool: Pool) {}

  async setLimit(input: {
    organizationId: string;
    resourceType: string;
    limitValue: number;
    resetPeriod?: string;
  }): Promise<UsageLimit> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<UsageLimitRow>(
      `INSERT INTO usage_limits (organization_id, resource_type, limit_value, reset_period)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, resource_type) DO UPDATE
         SET limit_value = EXCLUDED.limit_value, reset_period = EXCLUDED.reset_period
       RETURNING *`,
      [input.organizationId, input.resourceType, input.limitValue, input.resetPeriod ?? 'monthly'],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set usage limit');
    return this.mapLimit(row);
  }

  async getLimits(organizationId: string): Promise<UsageLimit[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<UsageLimitRow>(
      `SELECT * FROM usage_limits WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows.map((r) => this.mapLimit(r));
  }

  async checkQuota(organizationId: string, resourceType: string): Promise<QuotaCheckResult> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const limitResult = await this.pool.query<{ limit_value: string }>(
      `SELECT limit_value FROM usage_limits WHERE organization_id = $1 AND resource_type = $2`,
      [organizationId, resourceType],
    );

    const limitRow = limitResult.rows[0];
    if (!limitRow) {
      return { allowed: true, current: 0, limit: -1, percentUsed: 0 };
    }

    const limit = parseFloat(limitRow.limit_value);

    const currentResult = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(quantity), 0) AS total
       FROM usage_events
       WHERE organization_id = $1 AND resource_type = $2
         AND recorded_at >= date_trunc('month', NOW())`,
      [organizationId, resourceType],
    );

    const current = parseFloat(currentResult.rows[0]?.total ?? '0');
    const percentUsed = limit > 0 ? (current / limit) * 100 : 0;

    return {
      allowed: current < limit,
      current,
      limit,
      percentUsed,
    };
  }

  async createAlert(input: {
    organizationId: string;
    resourceType: string;
    thresholdPct: number;
  }): Promise<UsageAlert> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<UsageAlertRow>(
      `INSERT INTO usage_alerts (organization_id, resource_type, threshold_pct)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.organizationId, input.resourceType, input.thresholdPct],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create usage alert');
    return this.mapAlert(row);
  }

  private mapLimit(row: UsageLimitRow): UsageLimit {
    return {
      id: row.id,
      organizationId: row.organization_id,
      resourceType: row.resource_type,
      limitValue: parseFloat(row.limit_value),
      resetPeriod: row.reset_period,
      createdAt: row.created_at,
    };
  }

  private mapAlert(row: UsageAlertRow): UsageAlert {
    return {
      id: row.id,
      organizationId: row.organization_id,
      resourceType: row.resource_type,
      thresholdPct: parseFloat(row.threshold_pct),
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
    };
  }
}
