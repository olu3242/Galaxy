import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workflow_run_id UUID REFERENCES workflow_runs(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'escalated')),
      requested_by UUID NOT NULL,
      current_step_order INT NOT NULL DEFAULT 1,
      due_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      data JSONB NOT NULL DEFAULT '{}',
      correlation_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
      step_order INT NOT NULL,
      approver_id UUID NOT NULL,
      approver_type TEXT NOT NULL DEFAULT 'member'
        CHECK (approver_type IN ('member', 'role', 'department_head')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
      due_at TIMESTAMPTZ,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
      step_id UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
      approver_id UUID NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
      comment TEXT,
      decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'system')),
      actor_id TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS approvals_org_idx ON approvals (organization_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS approval_steps_approver_idx ON approval_steps (approver_id, status)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS approval_history');
  await pool.query('DROP TABLE IF EXISTS approval_decisions');
  await pool.query('DROP TABLE IF EXISTS approval_steps');
  await pool.query('DROP TABLE IF EXISTS approvals');
}
