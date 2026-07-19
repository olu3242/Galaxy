import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS healing_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      level TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'automatic',
      status TEXT NOT NULL DEFAULT 'detected',
      description TEXT NOT NULL,
      diagnosis TEXT,
      resolution TEXT,
      affected_resource_type TEXT,
      affected_resource_id TEXT,
      attempt_count INT NOT NULL DEFAULT 0,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      healed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ
    );
    ALTER TABLE healing_incidents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON healing_incidents
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS healing_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      level TEXT NOT NULL,
      name TEXT NOT NULL,
      condition JSONB NOT NULL DEFAULT '{}',
      action TEXT NOT NULL,
      priority INT NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE healing_rules ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON healing_rules
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS healing_rules;
    DROP TABLE IF EXISTS healing_incidents;
  `);
}
