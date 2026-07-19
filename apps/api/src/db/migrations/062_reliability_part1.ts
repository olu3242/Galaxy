import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Happy Path
    CREATE TABLE IF NOT EXISTS happy_path_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      scenario TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      steps JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE happy_path_templates ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON happy_path_templates
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS happy_path_simulations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      template_id UUID NOT NULL REFERENCES happy_path_templates(id) ON DELETE CASCADE,
      result TEXT NOT NULL,
      step_results JSONB NOT NULL DEFAULT '[]',
      duration_ms INT NOT NULL DEFAULT 0,
      error_message TEXT,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE happy_path_simulations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON happy_path_simulations
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Failure Registry
    CREATE TABLE IF NOT EXISTS failure_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      description TEXT NOT NULL,
      context JSONB NOT NULL DEFAULT '{}',
      recovery_rule_id UUID,
      resolved_by TEXT,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    ALTER TABLE failure_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON failure_records
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Confidence Engine
    CREATE TABLE IF NOT EXISTS confidence_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      score FLOAT NOT NULL,
      decision TEXT NOT NULL,
      factors JSONB NOT NULL DEFAULT '{}',
      review_request_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE confidence_scores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON confidence_scores
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS confidence_thresholds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL UNIQUE,
      auto_execute_min FLOAT NOT NULL DEFAULT 0.95,
      confirmation_min FLOAT NOT NULL DEFAULT 0.80,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE confidence_thresholds ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON confidence_thresholds
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS review_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      confidence_score_id UUID NOT NULL REFERENCES confidence_scores(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON review_requests
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS review_requests;
    DROP TABLE IF EXISTS confidence_thresholds;
    DROP TABLE IF EXISTS confidence_scores;
    DROP TABLE IF EXISTS failure_records;
    DROP TABLE IF EXISTS happy_path_simulations;
    DROP TABLE IF EXISTS happy_path_templates;
  `);
}
