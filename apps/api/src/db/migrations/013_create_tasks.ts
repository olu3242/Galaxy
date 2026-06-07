import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workflow_run_id UUID REFERENCES workflow_runs(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'escalated')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      assigned_to UUID,
      created_by UUID NOT NULL,
      due_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      data JSONB NOT NULL DEFAULT '{}',
      correlation_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      member_id UUID NOT NULL,
      assigned_by UUID NOT NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, member_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id UUID NOT NULL,
      content TEXT NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, depends_on_task_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'system')),
      actor_id TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS tasks_org_idx ON tasks (organization_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS tasks_assigned_idx ON tasks (organization_id, assigned_to, status)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS task_history_task_idx ON task_history (task_id, created_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS task_history');
  await pool.query('DROP TABLE IF EXISTS task_dependencies');
  await pool.query('DROP TABLE IF EXISTS task_comments');
  await pool.query('DROP TABLE IF EXISTS task_assignments');
  await pool.query('DROP TABLE IF EXISTS tasks');
}
