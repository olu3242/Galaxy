import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aof_optimizations (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      optimization_type TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'Detected' CHECK (status IN (
                          'Detected', 'Proposed', 'Simulated', 'Certified', 'Executing', 'Applied', 'Learning'
                        )),
      target_workflow   UUID,
      before_metrics    JSONB NOT NULL DEFAULT '{}',
      after_metrics     JSONB NOT NULL DEFAULT '{}',
      certification_id  UUID,
      applied_at        TIMESTAMPTZ,
      verified_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_optimizations_org_status
      ON aof_optimizations (organization_id, status, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_optimizations_org_created
      ON aof_optimizations (organization_id, created_at DESC)
  `);

  await pool.query(`ALTER TABLE aof_optimizations ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE aof_optimizations FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY aof_optimizations_tenant_isolation
      ON aof_optimizations
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_optimizations_insert
      ON aof_optimizations FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_optimizations_update
      ON aof_optimizations FOR UPDATE
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS aof_optimizations CASCADE`);
}
