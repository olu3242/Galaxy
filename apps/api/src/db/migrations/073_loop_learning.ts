import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_learning_insights (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id      UUID NOT NULL,
      workflow_template_id UUID NOT NULL,
      summary              TEXT NOT NULL,
      recommendations      JSONB NOT NULL DEFAULT '[]',
      optimization_score   INTEGER NOT NULL DEFAULT 50,
      priority             TEXT NOT NULL DEFAULT 'medium',
      metrics_snapshot     JSONB NOT NULL DEFAULT '{}',
      period_days          INTEGER NOT NULL DEFAULT 30,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organization_id, workflow_template_id)
    )
  `);

  await pool.query(`ALTER TABLE loop_learning_insights ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'loop_learning_insights' AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON loop_learning_insights
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END$$
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS loop_learning_insights`);
}
