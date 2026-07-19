import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Org lifecycle events
    CREATE TABLE IF NOT EXISTS org_lifecycle_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      event_type      TEXT NOT NULL,
      metadata        JSONB NOT NULL DEFAULT '{}',
      occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE org_lifecycle_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS org_lifecycle_events_tenant ON org_lifecycle_events;
    CREATE POLICY org_lifecycle_events_tenant ON org_lifecycle_events
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_org_lifecycle_events_org ON org_lifecycle_events (organization_id, occurred_at DESC);

    -- Org readiness scores
    CREATE TABLE IF NOT EXISTS org_readiness_scores (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      score           NUMERIC NOT NULL,
      dimensions      JSONB NOT NULL DEFAULT '{}',
      scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE org_readiness_scores ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS org_readiness_scores_tenant ON org_readiness_scores;
    CREATE POLICY org_readiness_scores_tenant ON org_readiness_scores
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_org_readiness_scores_org ON org_readiness_scores (organization_id, scored_at DESC);

    -- Org health checkpoints
    CREATE TABLE IF NOT EXISTS org_health_checkpoints (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      checkpoint_type  TEXT NOT NULL,
      passed           BOOLEAN NOT NULL DEFAULT false,
      notes            TEXT,
      checked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE org_health_checkpoints ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS org_health_checkpoints_tenant ON org_health_checkpoints;
    CREATE POLICY org_health_checkpoints_tenant ON org_health_checkpoints
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);

  // feature_flags was created in 043 with key/is_enabled columns.
  // Add enabled and rollout_percentage used by the FeatureFlagService.
  // NOTE: the `name` column is added by 079_feature_flags_name_column.
  await pool.query(`
    ALTER TABLE feature_flags
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS rollout_percentage NUMERIC NOT NULL DEFAULT 0
  `);

  // feature_entitlements and plan_features are new in this migration.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_entitlements (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      feature_flag_id  UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      enabled          BOOLEAN NOT NULL DEFAULT true,
      overridden_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, feature_flag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_feature_entitlements_org ON feature_entitlements (organization_id);

    CREATE TABLE IF NOT EXISTS plan_features (
      plan_name       TEXT NOT NULL,
      feature_flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      included        BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY (plan_name, feature_flag_id)
    );
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS plan_features;
    DROP TABLE IF EXISTS feature_entitlements;
  `);
  await pool.query(`
    ALTER TABLE feature_flags
      DROP COLUMN IF EXISTS rollout_percentage,
      DROP COLUMN IF EXISTS enabled
  `);
  await pool.query(`
    DROP TABLE IF EXISTS org_health_checkpoints;
    DROP TABLE IF EXISTS org_readiness_scores;
    DROP TABLE IF EXISTS org_lifecycle_events;
  `);
}
