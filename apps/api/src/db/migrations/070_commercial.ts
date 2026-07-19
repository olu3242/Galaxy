import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Commercial policies (global)
    CREATE TABLE IF NOT EXISTS commercial_policies (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_type  TEXT NOT NULL,
      rules        JSONB NOT NULL DEFAULT '{}',
      active       BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_commercial_policies_type ON commercial_policies (policy_type, active);

    -- Entitlement mappings (global)
    CREATE TABLE IF NOT EXISTS entitlement_mappings (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_name      TEXT NOT NULL,
      resource_type  TEXT NOT NULL,
      limit_value    NUMERIC NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_name, resource_type)
    );
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS entitlement_mappings;
    DROP TABLE IF EXISTS commercial_policies;
  `);
}
