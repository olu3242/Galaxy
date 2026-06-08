import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE workflows
      ADD COLUMN IF NOT EXISTS automation_domain TEXT CHECK (automation_domain IN ('communication','task','approval','incident','membership','event','hr','finance','knowledge','governance','executive')),
      ADD COLUMN IF NOT EXISTS flow_type TEXT CHECK (flow_type IN ('screen_flow','record_trigger','scheduled','automated','ai_flow')),
      ADD COLUMN IF NOT EXISTS owner_id UUID,
      ADD COLUMN IF NOT EXISTS department_id UUID,
      ADD COLUMN IF NOT EXISTS sla_duration_hours INT,
      ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS pack_id UUID
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      domain TEXT NOT NULL CHECK (domain IN ('hr','finance','membership','incident','communication','church','school','ngo','executive','governance')),
      description TEXT,
      version TEXT NOT NULL DEFAULT '1.0.0',
      config JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE workflow_runs
      ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS escalated_to UUID,
      ADD COLUMN IF NOT EXISTS automation_domain TEXT,
      ADD COLUMN IF NOT EXISTS flow_type TEXT
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS workflows_org_domain_flow_idx
      ON workflows (organization_id, automation_domain, flow_type)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS workflows_org_active_idx
      ON workflows (organization_id, is_active)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS workflow_packs_org_domain_idx
      ON workflow_packs (organization_id, domain)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS workflow_runs_org_sla_idx
      ON workflow_runs (organization_id, sla_due_at)
      WHERE sla_due_at IS NOT NULL
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP INDEX IF EXISTS workflow_runs_org_sla_idx`);
  await pool.query(`DROP INDEX IF EXISTS workflow_packs_org_domain_idx`);
  await pool.query(`DROP INDEX IF EXISTS workflows_org_active_idx`);
  await pool.query(`DROP INDEX IF EXISTS workflows_org_domain_flow_idx`);

  await pool.query(`
    ALTER TABLE workflow_runs
      DROP COLUMN IF EXISTS flow_type,
      DROP COLUMN IF EXISTS automation_domain,
      DROP COLUMN IF EXISTS escalated_to,
      DROP COLUMN IF EXISTS escalated_at,
      DROP COLUMN IF EXISTS sla_due_at
  `);

  await pool.query(`DROP TABLE IF EXISTS workflow_packs`);

  await pool.query(`
    ALTER TABLE workflows
      DROP COLUMN IF EXISTS pack_id,
      DROP COLUMN IF EXISTS tags,
      DROP COLUMN IF EXISTS sla_duration_hours,
      DROP COLUMN IF EXISTS department_id,
      DROP COLUMN IF EXISTS owner_id,
      DROP COLUMN IF EXISTS flow_type,
      DROP COLUMN IF EXISTS automation_domain
  `);
}
