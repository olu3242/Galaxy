import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_lifecycle_traces (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      execution_id     UUID NOT NULL UNIQUE,
      agent_type       TEXT NOT NULL,
      correlation_id   UUID NOT NULL,
      phases           JSONB NOT NULL DEFAULT '[]',
      total_duration_ms INTEGER NOT NULL DEFAULT 0,
      outcome          TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'delegated', 'escalated')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE agent_lifecycle_traces
      ENABLE ROW LEVEL SECURITY
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'agent_lifecycle_traces'
          AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON agent_lifecycle_traces
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END
    $$
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agent_lifecycle_traces_org_type_created
      ON agent_lifecycle_traces (organization_id, agent_type, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_agent_lifecycle_traces_correlation
      ON agent_lifecycle_traces (correlation_id)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS agent_lifecycle_traces`);
}
