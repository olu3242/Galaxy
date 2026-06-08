import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      enforcement_mode TEXT NOT NULL DEFAULT 'audit',
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON policies
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS policy_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value JSONB NOT NULL,
      action TEXT NOT NULL,
      priority INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON policy_rules
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS policy_enforcement_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      policy_id UUID NOT NULL REFERENCES policies(id),
      rule_id UUID,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      context JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE policy_enforcement_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON policy_enforcement_logs
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS policy_enforcement_logs;
    DROP TABLE IF EXISTS policy_rules;
    DROP TABLE IF EXISTS policies;
  `);
}
