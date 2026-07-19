import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deployment_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      natural_language_description TEXT NOT NULL,
      industry_hint TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      parsed_intent JSONB NOT NULL DEFAULT '{}',
      resources JSONB NOT NULL DEFAULT '[]',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    ALTER TABLE deployment_plans ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON deployment_plans
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS deployment_resources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_plan_id UUID NOT NULL REFERENCES deployment_plans(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL,
      resource_type TEXT NOT NULL,
      name TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE deployment_resources ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON deployment_resources
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS org_discovery_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      current_step INT NOT NULL DEFAULT 0,
      total_steps INT NOT NULL DEFAULT 7,
      responses JSONB NOT NULL DEFAULT '{}',
      generated_structure JSONB,
      status TEXT NOT NULL DEFAULT 'in_progress',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE org_discovery_sessions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON org_discovery_sessions
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS org_discovery_sessions;
    DROP TABLE IF EXISTS deployment_resources;
    DROP TABLE IF EXISTS deployment_plans;
  `);
}
