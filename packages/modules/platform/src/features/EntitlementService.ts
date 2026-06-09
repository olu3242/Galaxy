import type { Pool } from 'pg';

export interface PlanFeature {
  planName: string;
  featureFlagId: string;
  featureName: string;
  included: boolean;
}

interface PlanFeatureRow {
  plan_name: string;
  feature_flag_id: string;
  feature_name: string;
  included: boolean;
}

export class EntitlementService {
  constructor(private readonly pool: Pool) {}

  async getPlanFeatures(planName: string): Promise<PlanFeature[]> {
    const result = await this.pool.query<PlanFeatureRow>(
      `SELECT pf.plan_name, pf.feature_flag_id, ff.name AS feature_name, pf.included
       FROM plan_features pf
       JOIN feature_flags ff ON ff.id = pf.feature_flag_id
       WHERE pf.plan_name = $1`,
      [planName],
    );
    return result.rows.map((r) => ({
      planName: r.plan_name,
      featureFlagId: r.feature_flag_id,
      featureName: r.feature_name,
      included: r.included,
    }));
  }

  async setPlanFeature(input: {
    planName: string;
    featureFlagId: string;
    included: boolean;
  }): Promise<PlanFeature> {
    const result = await this.pool.query<PlanFeatureRow & { feature_name: string }>(
      `INSERT INTO plan_features (plan_name, feature_flag_id, included)
       VALUES ($1, $2, $3)
       ON CONFLICT (plan_name, feature_flag_id) DO UPDATE SET included = EXCLUDED.included
       RETURNING plan_name, feature_flag_id, included,
         (SELECT name FROM feature_flags WHERE id = $2) AS feature_name`,
      [input.planName, input.featureFlagId, input.included],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set plan feature');
    return {
      planName: row.plan_name,
      featureFlagId: row.feature_flag_id,
      featureName: row.feature_name,
      included: row.included,
    };
  }

  async orgHasFeature(organizationId: string, featureName: string): Promise<boolean> {
    const result = await this.pool.query<{ has_feature: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM feature_flags ff
         JOIN plan_features pf ON pf.feature_flag_id = ff.id
         JOIN organizations o ON o.plan = pf.plan_name AND o.id = $1
         WHERE ff.name = $2 AND pf.included = true
       ) AS has_feature`,
      [organizationId, featureName],
    );
    return result.rows[0]?.has_feature ?? false;
  }
}
