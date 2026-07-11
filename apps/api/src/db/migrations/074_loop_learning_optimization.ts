import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_phase_insights (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      workflow_type   TEXT,
      insight_type    TEXT NOT NULL,
      severity        TEXT NOT NULL DEFAULT 'info',
      summary         TEXT NOT NULL,
      data_points     JSONB NOT NULL DEFAULT '{}',
      generated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE loop_phase_insights ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'loop_phase_insights' AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON loop_phase_insights
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END$$
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS loop_phase_insights_org_idx
      ON loop_phase_insights (organization_id, generated_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_optimization_recommendations (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id      UUID NOT NULL,
      workflow_type        TEXT,
      recommendation_type  TEXT NOT NULL,
      priority             TEXT NOT NULL DEFAULT 'medium',
      title                TEXT NOT NULL,
      rationale            TEXT NOT NULL,
      estimated_impact     TEXT NOT NULL DEFAULT '',
      status               TEXT NOT NULL DEFAULT 'pending',
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE loop_optimization_recommendations ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'loop_optimization_recommendations' AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON loop_optimization_recommendations
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END$$
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS loop_opt_rec_org_status_idx
      ON loop_optimization_recommendations (organization_id, status)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS loop_optimization_recommendations`);
  await pool.query(`DROP TABLE IF EXISTS loop_phase_insights`);
}
