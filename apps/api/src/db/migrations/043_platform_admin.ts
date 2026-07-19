import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL,
      description TEXT,
      is_enabled BOOLEAN NOT NULL DEFAULT false,
      scope TEXT NOT NULL DEFAULT 'global',
      target_tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      config JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (key, target_tenant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      value JSONB NOT NULL DEFAULT 'null',
      description TEXT,
      updated_by TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_action_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_tenant_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      reason TEXT,
      performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON feature_flags(target_tenant_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin ON admin_action_logs(admin_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_admin_action_logs_tenant ON admin_action_logs(target_tenant_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_admin_action_logs_performed ON admin_action_logs(performed_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS admin_action_logs`);
  await pool.query(`DROP TABLE IF EXISTS system_config`);
  await pool.query(`DROP TABLE IF EXISTS feature_flags`);
}
