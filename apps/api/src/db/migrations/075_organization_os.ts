import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_hierarchy_nodes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      parent_id       UUID REFERENCES org_hierarchy_nodes(id) ON DELETE SET NULL,
      level           VARCHAR(32) NOT NULL,
      name            VARCHAR(255) NOT NULL,
      code            VARCHAR(64),
      metadata        JSONB NOT NULL DEFAULT '{}',
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_hierarchy_nodes_org
    ON org_hierarchy_nodes (organization_id, level, is_active)`);

  await pool.query(`ALTER TABLE org_hierarchy_nodes ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'org_hierarchy_nodes' AND policyname = 'org_hierarchy_nodes_tenant_isolation'
      ) THEN
        CREATE POLICY org_hierarchy_nodes_tenant_isolation ON org_hierarchy_nodes
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abac_policies (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name            VARCHAR(255) NOT NULL,
      description     TEXT,
      resource        VARCHAR(128) NOT NULL,
      action          VARCHAR(128) NOT NULL,
      conditions      JSONB NOT NULL DEFAULT '[]',
      effect          VARCHAR(8) NOT NULL,
      priority        INTEGER NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abac_policies_lookup
    ON abac_policies (organization_id, resource, action, is_active)`);

  await pool.query(`ALTER TABLE abac_policies ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'abac_policies' AND policyname = 'abac_policies_tenant_isolation'
      ) THEN
        CREATE POLICY abac_policies_tenant_isolation ON abac_policies
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS delegations (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      delegator_id    UUID NOT NULL,
      delegatee_id    UUID NOT NULL,
      role_id         UUID,
      permissions     TEXT[] NOT NULL DEFAULT '{}',
      reason          VARCHAR(64) NOT NULL,
      start_at        TIMESTAMPTZ NOT NULL,
      end_at          TIMESTAMPTZ NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      approved_by     UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_delegations_delegatee
    ON delegations (organization_id, delegatee_id, is_active)`);

  await pool.query(`ALTER TABLE delegations ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'delegations' AND policyname = 'delegations_tenant_isolation'
      ) THEN
        CREATE POLICY delegations_tenant_isolation ON delegations
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_rules (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id             UUID NOT NULL,
      workflow_type               VARCHAR(128),
      department_id               UUID,
      min_amount                  NUMERIC,
      max_amount                  NUMERIC,
      min_risk_score              NUMERIC,
      max_risk_score              NUMERIC,
      required_role               VARCHAR(128) NOT NULL,
      tier                        SMALLINT NOT NULL,
      requires_multiple_approvers BOOLEAN NOT NULL DEFAULT false,
      approver_count              INTEGER NOT NULL DEFAULT 1,
      escalation_after_hours      INTEGER NOT NULL DEFAULT 24,
      is_active                   BOOLEAN NOT NULL DEFAULT true,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_approval_rules_lookup
    ON approval_rules (organization_id, workflow_type, tier)`);

  await pool.query(`ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'approval_rules' AND policyname = 'approval_rules_tenant_isolation'
      ) THEN
        CREATE POLICY approval_rules_tenant_isolation ON approval_rules
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_permission_profiles (
      id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id              UUID NOT NULL,
      agent_type                   VARCHAR(64) NOT NULL,
      agent_name                   VARCHAR(255) NOT NULL,
      allowed_tools                TEXT[] NOT NULL DEFAULT '{}',
      accessible_knowledge_sources TEXT[] NOT NULL DEFAULT '{}',
      writable_resources           TEXT[] NOT NULL DEFAULT '{}',
      approval_limits              JSONB NOT NULL DEFAULT '{}',
      escalation_rules             JSONB NOT NULL DEFAULT '[]',
      is_active                    BOOLEAN NOT NULL DEFAULT true,
      created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_permission_profiles_type
    ON agent_permission_profiles (organization_id, agent_type, is_active)`);

  await pool.query(`ALTER TABLE agent_permission_profiles ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'agent_permission_profiles' AND policyname = 'agent_permission_profiles_tenant_isolation'
      ) THEN
        CREATE POLICY agent_permission_profiles_tenant_isolation ON agent_permission_profiles
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END $$
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS agent_permission_profiles`);
  await pool.query(`DROP TABLE IF EXISTS approval_rules`);
  await pool.query(`DROP TABLE IF EXISTS delegations`);
  await pool.query(`DROP TABLE IF EXISTS abac_policies`);
  await pool.query(`DROP TABLE IF EXISTS org_hierarchy_nodes`);
}
