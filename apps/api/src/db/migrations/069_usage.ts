import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Usage events (org-scoped)
    CREATE TABLE IF NOT EXISTS usage_events (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      resource_type    TEXT NOT NULL,
      quantity         NUMERIC NOT NULL DEFAULT 1,
      metadata         JSONB NOT NULL DEFAULT '{}',
      recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS usage_events_tenant ON usage_events;
    CREATE POLICY usage_events_tenant ON usage_events
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_usage_events_org ON usage_events (organization_id, resource_type, recorded_at DESC);

    -- Usage records (org-scoped aggregate)
    CREATE TABLE IF NOT EXISTS usage_records (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      period_start     TIMESTAMPTZ NOT NULL,
      period_end       TIMESTAMPTZ NOT NULL,
      resource_type    TEXT NOT NULL,
      total_quantity   NUMERIC NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS usage_records_tenant ON usage_records;
    CREATE POLICY usage_records_tenant ON usage_records
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Usage limits (org-scoped)
    CREATE TABLE IF NOT EXISTS usage_limits (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      resource_type    TEXT NOT NULL,
      limit_value      NUMERIC NOT NULL,
      reset_period     TEXT NOT NULL DEFAULT 'monthly',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, resource_type)
    );
    ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS usage_limits_tenant ON usage_limits;
    CREATE POLICY usage_limits_tenant ON usage_limits
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Usage alerts (org-scoped)
    CREATE TABLE IF NOT EXISTS usage_alerts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      resource_type    TEXT NOT NULL,
      threshold_pct    NUMERIC NOT NULL,
      triggered_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE usage_alerts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS usage_alerts_tenant ON usage_alerts;
    CREATE POLICY usage_alerts_tenant ON usage_alerts
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Revenue snapshots (global)
    CREATE TABLE IF NOT EXISTS revenue_snapshots (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mrr_cents             BIGINT NOT NULL DEFAULT 0,
      arr_cents             BIGINT NOT NULL DEFAULT 0,
      active_subscriptions  INTEGER NOT NULL DEFAULT 0,
      churned_this_month    INTEGER NOT NULL DEFAULT 0,
      new_this_month        INTEGER NOT NULL DEFAULT 0,
      snapshot_date         DATE NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_snapshots_date ON revenue_snapshots (snapshot_date DESC);

    -- Customer health scores (global, cross-tenant analytics)
    CREATE TABLE IF NOT EXISTS customer_health_scores (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      score            NUMERIC NOT NULL,
      factors          JSONB NOT NULL DEFAULT '{}',
      scored_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_customer_health_scores_org ON customer_health_scores (organization_id, scored_at DESC);
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS customer_health_scores;
    DROP TABLE IF EXISTS revenue_snapshots;
    DROP TABLE IF EXISTS usage_alerts;
    DROP TABLE IF EXISTS usage_limits;
    DROP TABLE IF EXISTS usage_records;
    DROP TABLE IF EXISTS usage_events;
  `);
}
