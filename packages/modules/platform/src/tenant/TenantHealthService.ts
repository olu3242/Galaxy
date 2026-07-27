import type { Pool } from 'pg';

export interface TenantHealth {
  id: string;
  tenantId: string;
  score: number;
  metrics: Record<string, unknown>;
  checkedAt: string;
}

export interface TenantLimit {
  id: string;
  tenantId: string;
  resourceType: string;
  limitValue: number;
  currentValue: number;
}

interface TenantHealthRow {
  id: string;
  tenant_id: string;
  score: string;
  metrics: Record<string, unknown>;
  checked_at: string;
}

interface TenantLimitRow {
  id: string;
  tenant_id: string;
  resource_type: string;
  limit_value: string;
  current_value: string;
}

export class TenantHealthService {
  constructor(private readonly pool: Pool) {}

  async recordHealth(input: {
    tenantId: string;
    score: number;
    metrics?: Record<string, unknown>;
  }): Promise<TenantHealth> {
    const result = await this.pool.query<TenantHealthRow>(
      `INSERT INTO tenant_health (tenant_id, score, metrics)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.tenantId, input.score, JSON.stringify(input.metrics ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record tenant health');
    return this.mapHealth(row);
  }

  async getLatestHealth(tenantId: string): Promise<TenantHealth | null> {
    const result = await this.pool.query<TenantHealthRow>(
      `SELECT * FROM tenant_health WHERE tenant_id = $1 ORDER BY checked_at DESC LIMIT 1`,
      [tenantId],
    );
    const row = result.rows[0];
    return row ? this.mapHealth(row) : null;
  }

  async getTenantLimits(tenantId: string): Promise<TenantLimit[]> {
    const result = await this.pool.query<TenantLimitRow>(
      `SELECT * FROM platform_tenant_limits WHERE tenant_id = $1`,
      [tenantId],
    );
    return result.rows.map((r) => this.mapLimit(r));
  }

  async setTenantLimit(input: {
    tenantId: string;
    resourceType: string;
    limitValue: number;
    currentValue?: number;
  }): Promise<TenantLimit> {
    const result = await this.pool.query<TenantLimitRow>(
      `INSERT INTO platform_tenant_limits (tenant_id, resource_type, limit_value, current_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, resource_type) DO UPDATE
         SET limit_value = EXCLUDED.limit_value,
             current_value = COALESCE(EXCLUDED.current_value, platform_tenant_limits.current_value)
       RETURNING *`,
      [input.tenantId, input.resourceType, input.limitValue, input.currentValue ?? 0],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set tenant limit');
    return this.mapLimit(row);
  }

  private mapHealth(row: TenantHealthRow): TenantHealth {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      score: parseFloat(row.score),
      metrics: row.metrics,
      checkedAt: row.checked_at,
    };
  }

  private mapLimit(row: TenantLimitRow): TenantLimit {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      resourceType: row.resource_type,
      limitValue: parseFloat(row.limit_value),
      currentValue: parseFloat(row.current_value),
    };
  }
}
