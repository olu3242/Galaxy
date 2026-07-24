import type { Pool } from 'pg';

/**
 * Creates workstream_checkpoints — durable snapshots of workstream execution state.
 *
 * Checkpoints allow the WRF self-healing engine to resume a workstream from
 * the last known good stage after a worker crash, queue failure, or network
 * partition, without re-executing already-completed stages.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstream_checkpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workstream_id UUID NOT NULL,
      stage TEXT NOT NULL,
      execution_state TEXT NOT NULL DEFAULT 'running',
      state JSONB NOT NULL DEFAULT '{}',
      retry_count INT NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'internal',
      intent TEXT,
      workflow_id UUID,
      actor_id UUID,
      correlation_id UUID NOT NULL,
      request_id UUID NOT NULL,
      agent_ids UUID[] NOT NULL DEFAULT '{}',
      warnings TEXT[] NOT NULL DEFAULT '{}',
      errors JSONB NOT NULL DEFAULT '[]',
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_checkpoints_org_workstream
      ON workstream_checkpoints (organization_id, workstream_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_checkpoints_org_state
      ON workstream_checkpoints (organization_id, execution_state)
      WHERE execution_state NOT IN ('completed', 'cancelled')
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_checkpoints_expires
      ON workstream_checkpoints (expires_at)
  `);

  await pool.query(`ALTER TABLE workstream_checkpoints ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE workstream_checkpoints FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY workstream_checkpoints_tenant_isolation
      ON workstream_checkpoints
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS workstream_checkpoints CASCADE`);
}
