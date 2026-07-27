import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_lifecycle (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event_type       TEXT NOT NULL,
      performed_by     TEXT NOT NULL DEFAULT 'system',
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_lifecycle_org ON tenant_lifecycle (organization_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_tenant_limits (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      max_members          INTEGER NOT NULL DEFAULT 25,
      max_workflows        INTEGER NOT NULL DEFAULT 50,
      max_agents           INTEGER NOT NULL DEFAULT 3,
      api_calls_per_month  INTEGER NOT NULL DEFAULT 10000,
      storage_mb           INTEGER NOT NULL DEFAULT 512,
      UNIQUE (organization_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_health (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      score       NUMERIC(5,2) NOT NULL DEFAULT 0,
      metrics     JSONB NOT NULL DEFAULT '{}',
      checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_health_tenant ON tenant_health (tenant_id, checked_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_tenant_limits (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL,
      limit_value   NUMERIC NOT NULL DEFAULT 0,
      current_value NUMERIC NOT NULL DEFAULT 0,
      UNIQUE (tenant_id, resource_type)
    );
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS platform_tenant_limits;
    DROP TABLE IF EXISTS tenant_health;
    DROP TABLE IF EXISTS org_tenant_limits;
    DROP TABLE IF EXISTS tenant_lifecycle;
  `);
}
