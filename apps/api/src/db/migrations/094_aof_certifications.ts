import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aof_certifications (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      optimization_id UUID NOT NULL REFERENCES aof_optimizations(id),
      status          TEXT NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed', 'Under Review', 'Certified', 'Rejected')),
      checklist       JSONB NOT NULL DEFAULT '{}',
      rollback_plan   JSONB NOT NULL DEFAULT '{}',
      reviewer_id     UUID,
      decided_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_certifications_org_status
      ON aof_certifications (organization_id, status, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_certifications_optimization
      ON aof_certifications (optimization_id)
  `);

  await pool.query(`ALTER TABLE aof_certifications ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE aof_certifications FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY aof_certifications_tenant_isolation
      ON aof_certifications
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_certifications_insert
      ON aof_certifications FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_certifications_update
      ON aof_certifications FOR UPDATE
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS aof_certifications CASCADE`);
}
