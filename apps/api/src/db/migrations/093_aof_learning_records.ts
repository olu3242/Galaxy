import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aof_learning_records (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      optimization_id   UUID NOT NULL REFERENCES aof_optimizations(id),
      predicted_metrics JSONB NOT NULL DEFAULT '{}',
      actual_metrics    JSONB NOT NULL DEFAULT '{}',
      delta             JSONB NOT NULL DEFAULT '{}',
      recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_learning_records_org_recorded
      ON aof_learning_records (organization_id, recorded_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_learning_records_optimization
      ON aof_learning_records (optimization_id)
  `);

  await pool.query(`ALTER TABLE aof_learning_records ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE aof_learning_records FORCE ROW LEVEL SECURITY`);

  // Insert-only — learning records are immutable event history
  await pool.query(`
    CREATE POLICY aof_learning_records_insert
      ON aof_learning_records FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS aof_learning_records CASCADE`);
}
