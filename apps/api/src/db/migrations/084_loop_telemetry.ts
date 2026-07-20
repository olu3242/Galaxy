import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS execution_telemetry (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id        UUID NOT NULL,
      workflow_run_id        UUID NOT NULL,
      workflow_definition_id UUID NOT NULL,
      correlation_id         UUID NOT NULL,
      duration_ms            BIGINT NOT NULL DEFAULT 0,
      step_count             INT NOT NULL DEFAULT 0,
      completed_steps        INT NOT NULL DEFAULT 0,
      failed_steps           INT NOT NULL DEFAULT 0,
      agent_types            TEXT[] NOT NULL DEFAULT '{}',
      approval_wait_ms       BIGINT NOT NULL DEFAULT 0,
      retry_count            INT NOT NULL DEFAULT 0,
      outcome                TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'cancelled', 'timeout')),
      bottlenecks            TEXT[] NOT NULL DEFAULT '{}',
      error_messages         TEXT[] NOT NULL DEFAULT '{}',
      cost_tokens            INT NOT NULL DEFAULT 0,
      recorded_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE execution_telemetry ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'execution_telemetry'
          AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON execution_telemetry
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END
    $$
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_exec_telemetry_org_def_time
      ON execution_telemetry (organization_id, workflow_definition_id, recorded_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_exec_telemetry_org_run
      ON execution_telemetry (organization_id, workflow_run_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_exec_telemetry_org_outcome
      ON execution_telemetry (organization_id, outcome, recorded_at DESC)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS execution_telemetry`);
}
