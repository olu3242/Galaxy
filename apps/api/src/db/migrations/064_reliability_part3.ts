import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simulation_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      simulation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      config JSONB NOT NULL DEFAULT '{}',
      results JSONB NOT NULL DEFAULT '{}',
      duration_ms INT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON simulation_runs
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS simulation_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      run_id UUID NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      passed INT NOT NULL DEFAULT 0,
      failed INT NOT NULL DEFAULT 0,
      coverage JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE simulation_reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON simulation_reports
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS reliability_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      overall_score FLOAT NOT NULL,
      metrics JSONB NOT NULL DEFAULT '[]',
      passing BOOLEAN NOT NULL DEFAULT false,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE reliability_reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON reliability_reports
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS reliability_reports;
    DROP TABLE IF EXISTS simulation_reports;
    DROP TABLE IF EXISTS simulation_runs;
  `);
}
