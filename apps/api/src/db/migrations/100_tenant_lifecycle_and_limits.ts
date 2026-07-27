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
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS org_tenant_limits;
    DROP TABLE IF EXISTS tenant_lifecycle;
  `);
}
