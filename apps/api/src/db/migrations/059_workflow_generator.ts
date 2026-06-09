import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_generation_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      natural_language_description TEXT NOT NULL,
      industry_hint TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      generated_workflow JSONB,
      steps JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    ALTER TABLE workflow_generation_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON workflow_generation_requests
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS workflow_generation_requests;');
}
