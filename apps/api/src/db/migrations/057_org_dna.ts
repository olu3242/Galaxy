import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_dna (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL UNIQUE,
      identity_profile JSONB NOT NULL DEFAULT '{}',
      operating_profile JSONB NOT NULL DEFAULT '{}',
      workflow_profile JSONB NOT NULL DEFAULT '{}',
      language_profile JSONB NOT NULL DEFAULT '{}',
      industry_blueprint TEXT,
      completeness_score FLOAT NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE org_dna ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON org_dna
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS org_language_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      aliases JSONB NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, term)
    );
    ALTER TABLE org_language_entries ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON org_language_entries
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS industry_blueprints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      industry TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      default_workflows JSONB NOT NULL DEFAULT '{}',
      default_roles JSONB NOT NULL DEFAULT '{}',
      default_policies JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS industry_blueprints;
    DROP TABLE IF EXISTS org_language_entries;
    DROP TABLE IF EXISTS org_dna;
  `);
}
