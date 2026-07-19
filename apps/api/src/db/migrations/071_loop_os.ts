import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      workflow_instance_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','verifying','collecting_feedback','completed','escalated')),
      verification_deadline TIMESTAMPTZ NOT NULL,
      feedback_deadline TIMESTAMPTZ,
      verification_count INT NOT NULL DEFAULT 0,
      feedback_score NUMERIC(3,2),
      outcome_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE loop_instances ENABLE ROW LEVEL SECURITY
  `);

  await pool.query(`
    CREATE POLICY loop_instances_org ON loop_instances
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS loop_instances_org_idx ON loop_instances (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS loop_instances_workflow_idx ON loop_instances (workflow_instance_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS loop_instances_status_deadline_idx
      ON loop_instances (status, verification_deadline)
      WHERE status = 'verifying'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      loop_instance_id UUID NOT NULL REFERENCES loop_instances(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL,
      verified_by UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','rejected','expired')),
      notes TEXT,
      evidence_urls JSONB NOT NULL DEFAULT '[]',
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE loop_verifications ENABLE ROW LEVEL SECURITY
  `);

  await pool.query(`
    CREATE POLICY loop_verifications_org ON loop_verifications
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS loop_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      loop_instance_id UUID NOT NULL REFERENCES loop_instances(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL,
      submitted_by UUID NOT NULL,
      score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
      comment TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE loop_feedback ENABLE ROW LEVEL SECURITY
  `);

  await pool.query(`
    CREATE POLICY loop_feedback_org ON loop_feedback
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS loop_feedback CASCADE');
  await pool.query('DROP TABLE IF EXISTS loop_verifications CASCADE');
  await pool.query('DROP TABLE IF EXISTS loop_instances CASCADE');
}
