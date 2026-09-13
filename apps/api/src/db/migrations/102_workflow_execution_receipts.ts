import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_execution_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      engine TEXT NOT NULL,
      outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
      correlation_id TEXT,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, idempotency_key)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workflow_execution_receipts_run_step
      ON workflow_execution_receipts (organization_id, run_id, step_id, processed_at DESC)
  `);

  await pool.query(`ALTER TABLE workflow_execution_receipts ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE workflow_execution_receipts FORCE ROW LEVEL SECURITY`);
  await pool.query(`DROP POLICY IF EXISTS workflow_execution_receipts_tenant_isolation ON workflow_execution_receipts`);
  await pool.query(`
    CREATE POLICY workflow_execution_receipts_tenant_isolation
      ON workflow_execution_receipts
      USING (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
      WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS workflow_execution_receipts CASCADE');
}
