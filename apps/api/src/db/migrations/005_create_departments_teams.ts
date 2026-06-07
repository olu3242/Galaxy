import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      parent_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      head_member_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS departments_org_idx ON departments (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS departments_parent_idx ON departments (parent_department_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      lead_member_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS teams_org_idx ON teams (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS teams_dept_idx ON teams (department_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (team_id, membership_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS team_members_org_idx ON team_members (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members (team_id)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS team_members');
  await pool.query('DROP TABLE IF EXISTS teams');
  await pool.query('DROP TABLE IF EXISTS departments');
}
