import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Org configurations (org-scoped)
    CREATE TABLE IF NOT EXISTS org_configurations (
      organization_id  UUID NOT NULL,
      namespace        TEXT NOT NULL,
      key              TEXT NOT NULL,
      value            TEXT NOT NULL,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, namespace, key)
    );
    ALTER TABLE org_configurations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS org_configurations_tenant ON org_configurations;
    CREATE POLICY org_configurations_tenant ON org_configurations
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_org_configurations_org ON org_configurations (organization_id, namespace);

    -- Config schemas (global)
    CREATE TABLE IF NOT EXISTS config_schemas (
      namespace      TEXT NOT NULL,
      key            TEXT NOT NULL,
      value_type     TEXT NOT NULL DEFAULT 'string',
      default_value  TEXT,
      description    TEXT,
      PRIMARY KEY (namespace, key)
    );

    -- Platform metrics (global, separate from admin metrics)
    CREATE TABLE IF NOT EXISTS platform_metrics (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      metric_name  TEXT NOT NULL,
      value        NUMERIC NOT NULL,
      labels       JSONB NOT NULL DEFAULT '{}',
      recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_platform_metrics_name ON platform_metrics (metric_name, recorded_at DESC);

    -- Platform health snapshots (global)
    CREATE TABLE IF NOT EXISTS platform_health_snapshots (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status       TEXT NOT NULL,
      components   JSONB NOT NULL DEFAULT '{}',
      snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_platform_health_snapshots_at ON platform_health_snapshots (snapshot_at DESC);
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS platform_health_snapshots;
    DROP TABLE IF EXISTS platform_metrics;
    DROP TABLE IF EXISTS config_schemas;
    DROP TABLE IF EXISTS org_configurations;
  `);
}
