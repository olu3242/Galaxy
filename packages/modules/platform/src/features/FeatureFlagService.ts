import type { Pool } from 'pg';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  createdAt: string;
}

export interface FeatureEntitlement {
  id: string;
  organizationId: string;
  featureFlagId: string;
  enabled: boolean;
  overriddenAt: string;
}

interface FeatureFlagRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: string;
  created_at: string;
}

interface FeatureEntitlementRow {
  id: string;
  organization_id: string;
  feature_flag_id: string;
  enabled: boolean;
  overridden_at: string;
}

export class FeatureFlagService {
  constructor(private readonly pool: Pool) {}

  async createFlag(input: {
    name: string;
    description?: string;
    enabled?: boolean;
    rolloutPercentage?: number;
  }): Promise<FeatureFlag> {
    const result = await this.pool.query<FeatureFlagRow>(
      `INSERT INTO feature_flags (key, description, enabled, rollout_percentage)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, input.description ?? null, input.enabled ?? false, input.rolloutPercentage ?? 0],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create feature flag');
    return this.mapFlag(row);
  }

  async listFlags(): Promise<FeatureFlag[]> {
    const result = await this.pool.query<FeatureFlagRow>(
      `SELECT * FROM feature_flags ORDER BY name`,
    );
    return result.rows.map((r) => this.mapFlag(r));
  }

  async toggleFlag(flagId: string, enabled: boolean): Promise<FeatureFlag | null> {
    const result = await this.pool.query<FeatureFlagRow>(
      `UPDATE feature_flags SET enabled = $1 WHERE id = $2 RETURNING *`,
      [enabled, flagId],
    );
    const row = result.rows[0];
    return row ? this.mapFlag(row) : null;
  }

  async setEntitlement(input: {
    organizationId: string;
    featureFlagId: string;
    enabled: boolean;
  }): Promise<FeatureEntitlement> {
    const result = await this.pool.query<FeatureEntitlementRow>(
      `INSERT INTO feature_entitlements (organization_id, feature_flag_id, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, feature_flag_id) DO UPDATE
         SET enabled = EXCLUDED.enabled, overridden_at = NOW()
       RETURNING *`,
      [input.organizationId, input.featureFlagId, input.enabled],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set entitlement');
    return this.mapEntitlement(row);
  }

  async getEntitlements(organizationId: string): Promise<FeatureEntitlement[]> {
    const result = await this.pool.query<FeatureEntitlementRow>(
      `SELECT * FROM feature_entitlements WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows.map((r) => this.mapEntitlement(r));
  }

  async isEnabled(organizationId: string, featureName: string): Promise<boolean> {
    const result = await this.pool.query<{ enabled: boolean }>(
      `SELECT COALESCE(fe.enabled, ff.enabled) AS enabled
       FROM feature_flags ff
       LEFT JOIN feature_entitlements fe
         ON fe.feature_flag_id = ff.id AND fe.organization_id = $1
       WHERE ff.name = $2`,
      [organizationId, featureName],
    );
    return result.rows[0]?.enabled ?? false;
  }

  private mapFlag(row: FeatureFlagRow): FeatureFlag {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      rolloutPercentage: parseFloat(row.rollout_percentage),
      createdAt: row.created_at,
    };
  }

  private mapEntitlement(row: FeatureEntitlementRow): FeatureEntitlement {
    return {
      id: row.id,
      organizationId: row.organization_id,
      featureFlagId: row.feature_flag_id,
      enabled: row.enabled,
      overriddenAt: row.overridden_at,
    };
  }
}
