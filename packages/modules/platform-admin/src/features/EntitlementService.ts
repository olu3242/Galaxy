import type { Pool } from 'pg';

export interface Entitlement {
  id: string;
  planTier: string;
  featureKey: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface OrgFeatureOverride {
  id: string;
  organizationId: string;
  featureKey: string;
  isEnabled: boolean;
  overrideReason: string | null;
  createdAt: string;
}

interface EntitlementRow {
  id: string;
  plan_tier: string;
  feature_key: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

interface OverrideRow {
  id: string;
  organization_id: string;
  feature_key: string;
  is_enabled: boolean;
  override_reason: string | null;
  created_at: string;
}

export class EntitlementService {
  constructor(private readonly pool: Pool) {}

  async getEntitlementsForPlan(planTier: string): Promise<Entitlement[]> {
    const result = await this.pool.query<EntitlementRow>(
      'SELECT * FROM feature_entitlements WHERE plan_tier = $1 ORDER BY feature_key ASC',
      [planTier],
    );
    return result.rows.map((row) => this.rowToEntitlement(row));
  }

  async isFeatureEntitled(planTier: string, featureKey: string): Promise<boolean> {
    const result = await this.pool.query<EntitlementRow>(
      'SELECT * FROM feature_entitlements WHERE plan_tier = $1 AND feature_key = $2 LIMIT 1',
      [planTier, featureKey],
    );
    return result.rows[0]?.is_enabled ?? false;
  }

  async upsertEntitlement(
    planTier: string,
    featureKey: string,
    isEnabled: boolean,
    config?: Record<string, unknown>,
  ): Promise<Entitlement> {
    const result = await this.pool.query<EntitlementRow>(
      `INSERT INTO feature_entitlements (plan_tier, feature_key, is_enabled, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_tier, feature_key) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         config = EXCLUDED.config
       RETURNING *`,
      [planTier, featureKey, isEnabled, JSON.stringify(config ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Upsert failed');
    return this.rowToEntitlement(row);
  }

  async getOrgOverride(orgId: string, featureKey: string): Promise<OrgFeatureOverride | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<OverrideRow>(
      'SELECT * FROM org_feature_overrides WHERE organization_id = $1 AND feature_key = $2 LIMIT 1',
      [orgId, featureKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToOverride(row);
  }

  async setOrgOverride(
    orgId: string,
    featureKey: string,
    isEnabled: boolean,
    reason?: string,
  ): Promise<OrgFeatureOverride> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<OverrideRow>(
      `INSERT INTO org_feature_overrides (organization_id, feature_key, is_enabled, override_reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, feature_key) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         override_reason = EXCLUDED.override_reason
       RETURNING *`,
      [orgId, featureKey, isEnabled, reason ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Override upsert failed');
    return this.rowToOverride(row);
  }

  async isFeatureEnabledForOrg(
    orgId: string,
    featureKey: string,
    planTier: string,
  ): Promise<boolean> {
    const override = await this.getOrgOverride(orgId, featureKey);
    if (override !== null) return override.isEnabled;
    return this.isFeatureEntitled(planTier, featureKey);
  }

  private rowToEntitlement(row: EntitlementRow): Entitlement {
    return {
      id: row.id,
      planTier: row.plan_tier,
      featureKey: row.feature_key,
      isEnabled: row.is_enabled,
      config: row.config,
      createdAt: row.created_at,
    };
  }

  private rowToOverride(row: OverrideRow): OrgFeatureOverride {
    return {
      id: row.id,
      organizationId: row.organization_id,
      featureKey: row.feature_key,
      isEnabled: row.is_enabled,
      overrideReason: row.override_reason,
      createdAt: row.created_at,
    };
  }
}
