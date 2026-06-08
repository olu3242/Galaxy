import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS governance_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      policy_type TEXT NOT NULL CHECK (policy_type IN ('data_retention', 'access_control', 'workflow_approval')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
      config JSONB NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_id UUID NOT NULL REFERENCES governance_policies(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      condition JSONB NOT NULL DEFAULT '{}',
      action TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      check_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warning')),
      details JSONB NOT NULL DEFAULT '{}',
      violations TEXT[] NOT NULL DEFAULT '{}',
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      run_by TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      total_checks INTEGER NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      warnings INTEGER NOT NULL DEFAULT 0,
      summary JSONB NOT NULL DEFAULT '{}',
      generated_by TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_retention_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL,
      retention_days INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('flag', 'archive', 'delete')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_governance_policies_org ON governance_policies(organization_id)`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_policy_rules_policy ON policy_rules(policy_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_compliance_checks_org ON compliance_checks(organization_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_compliance_reports_org ON compliance_reports(organization_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_retention_policies_org ON data_retention_policies(organization_id)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS data_retention_policies CASCADE');
  await pool.query('DROP TABLE IF EXISTS compliance_reports CASCADE');
  await pool.query('DROP TABLE IF EXISTS compliance_checks CASCADE');
  await pool.query('DROP TABLE IF EXISTS policy_rules CASCADE');
  await pool.query('DROP TABLE IF EXISTS governance_policies CASCADE');
}
