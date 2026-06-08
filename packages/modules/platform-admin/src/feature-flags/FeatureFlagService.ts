import type { Pool } from 'pg';
import type { FeatureFlag, CreateFeatureFlagInput } from '../types.js';

interface FeatureFlagRow {
  id: string;
  key: string;
  description: string | null;
  is_enabled: boolean;
  scope: string;
  target_tenant_id: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function mapFlag(row: FeatureFlagRow): FeatureFlag {
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    isEnabled: row.is_enabled,
    scope: row.scope,
    targetTenantId: row.target_tenant_id,
    config: row.config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class FeatureFlagService {
  constructor(private readonly pool: Pool) {}

  async createFlag(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
    const result = await this.pool.query<FeatureFlagRow>(
      `INSERT INTO feature_flags (key, description, is_enabled, scope, target_tenant_id, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.key,
        input.description ?? null,
        input.isEnabled ?? false,
        input.scope ?? 'global',
        input.targetTenantId ?? null,
        JSON.stringify(input.config ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Upsert into feature_flags returned no row');
    return mapFlag(row);
  }

  async getFlag(key: string, tenantId?: string): Promise<FeatureFlag | null> {
    if (tenantId !== undefined) {
      const tenantResult = await this.pool.query<FeatureFlagRow>(
        `SELECT * FROM feature_flags WHERE key = $1 AND target_tenant_id = $2 LIMIT 1`,
        [key, tenantId],
      );
      if (tenantResult.rows[0]) return mapFlag(tenantResult.rows[0]);
    }

    const globalResult = await this.pool.query<FeatureFlagRow>(
      `SELECT * FROM feature_flags WHERE key = $1 AND (target_tenant_id IS NULL OR scope = 'global') LIMIT 1`,
      [key],
    );

    return globalResult.rows[0] ? mapFlag(globalResult.rows[0]) : null;
  }

  async listFlags(opts?: { scope?: string; targetTenantId?: string }): Promise<FeatureFlag[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.scope !== undefined) {
      conditions.push(`scope = $${String(idx)}`);
      params.push(opts.scope);
      idx++;
    }
    if (opts?.targetTenantId !== undefined) {
      conditions.push(`target_tenant_id = $${String(idx)}`);
      params.push(opts.targetTenantId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query<FeatureFlagRow>(
      `SELECT * FROM feature_flags ${whereClause} ORDER BY key ASC`,
      params,
    );

    return result.rows.map(mapFlag);
  }

  async toggleFlag(flagId: string, isEnabled: boolean): Promise<FeatureFlag | null> {
    const result = await this.pool.query<FeatureFlagRow>(
      `UPDATE feature_flags SET is_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [isEnabled, flagId],
    );

    return result.rows[0] ? mapFlag(result.rows[0]) : null;
  }

  async isFlagEnabled(key: string, tenantId?: string): Promise<boolean> {
    const flag = await this.getFlag(key, tenantId);
    return flag?.isEnabled ?? false;
  }

  async deleteFlag(flagId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM feature_flags WHERE id = $1`, [flagId]);
    return (result.rowCount ?? 0) > 0;
  }
}
