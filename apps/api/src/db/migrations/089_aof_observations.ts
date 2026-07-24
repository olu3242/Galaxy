import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aof_observations (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event_id        UUID NOT NULL,
      event_type      TEXT NOT NULL,
      workflow_id     UUID,
      stage_id        UUID,
      actor_type      TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'system')),
      duration_ms     INTEGER,
      outcome         TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'timeout', 'cancelled')),
      metadata        JSONB NOT NULL DEFAULT '{}',
      observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_observations_org_observed
      ON aof_observations (organization_id, observed_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_observations_org_event_type
      ON aof_observations (organization_id, event_type, observed_at DESC)
  `);

  await pool.query(`ALTER TABLE aof_observations ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE aof_observations FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY aof_observations_tenant_isolation
      ON aof_observations
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_observations_insert
      ON aof_observations FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS aof_observations CASCADE`);
}
