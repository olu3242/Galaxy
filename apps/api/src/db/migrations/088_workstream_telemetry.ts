import type { Pool } from 'pg';

/**
 * Creates workstream_telemetry — one row per stage transition in every workstream.
 *
 * This is the raw telemetry store for Mission Control dashboards, latency
 * percentile calculations, per-dependency error rate analysis, and the
 * Workstream Health Matrix regenerated at each release gate.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workstream_telemetry (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workstream_id UUID NOT NULL,
      stage TEXT NOT NULL,
      duration_ms INT NOT NULL,
      success BOOLEAN NOT NULL,
      error_code TEXT,
      dependency TEXT,
      agent_id UUID,
      retry_count INT NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'internal',
      intent TEXT,
      correlation_id UUID NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_telemetry_org_recorded
      ON workstream_telemetry (organization_id, recorded_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_telemetry_org_stage
      ON workstream_telemetry (organization_id, stage, recorded_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_telemetry_workstream
      ON workstream_telemetry (workstream_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workstream_telemetry_dependency
      ON workstream_telemetry (dependency, recorded_at DESC)
      WHERE dependency IS NOT NULL
  `);

  await pool.query(`ALTER TABLE workstream_telemetry ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE workstream_telemetry FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY workstream_telemetry_tenant_isolation
      ON workstream_telemetry
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS workstream_telemetry CASCADE`);
}
