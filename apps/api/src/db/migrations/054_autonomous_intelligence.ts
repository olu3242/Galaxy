import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS autonomous_agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      agent_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      config JSONB NOT NULL DEFAULT '{}',
      metrics JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, agent_type)
    );
    ALTER TABLE autonomous_agents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON autonomous_agents
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS agent_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      agent_id UUID NOT NULL REFERENCES autonomous_agents(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload JSONB NOT NULL DEFAULT '{}',
      result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON agent_actions
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS agent_insights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      agent_id UUID NOT NULL REFERENCES autonomous_agents(id) ON DELETE CASCADE,
      insight_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence FLOAT NOT NULL DEFAULT 0,
      data JSONB NOT NULL DEFAULT '{}',
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE agent_insights ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON agent_insights
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS agent_insights;
    DROP TABLE IF EXISTS agent_actions;
    DROP TABLE IF EXISTS autonomous_agents;
  `);
}
