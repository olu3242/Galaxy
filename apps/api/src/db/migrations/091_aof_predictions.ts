import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aof_predictions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      prediction_type TEXT NOT NULL,
      horizon_minutes INTEGER NOT NULL,
      payload         JSONB NOT NULL DEFAULT '{}',
      confidence      NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_predictions_org_created
      ON aof_predictions (organization_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_predictions_org_type
      ON aof_predictions (organization_id, prediction_type, created_at DESC)
  `);

  await pool.query(`ALTER TABLE aof_predictions ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE aof_predictions FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY aof_predictions_tenant_isolation
      ON aof_predictions
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_predictions_insert
      ON aof_predictions FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS aof_predictions CASCADE`);
}
