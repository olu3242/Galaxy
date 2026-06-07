import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      version INT NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT false,
      definition JSONB NOT NULL DEFAULT '{}',
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      step_type TEXT NOT NULL
        CHECK (step_type IN ('manual_task', 'approval', 'notification', 'condition', 'automation')),
      step_order INT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      next_step_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_conditions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
      condition_type TEXT NOT NULL CHECK (condition_type IN ('field_equals', 'field_gt', 'field_lt', 'field_contains', 'custom')),
      field TEXT,
      operator TEXT,
      value JSONB,
      next_step_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES workflows(id),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
      current_step_id UUID,
      triggered_by UUID NOT NULL,
      trigger_data JSONB NOT NULL DEFAULT '{}',
      output_data JSONB NOT NULL DEFAULT '{}',
      correlation_id UUID NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_run_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      step_id UUID NOT NULL REFERENCES workflow_steps(id),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
      input_data JSONB NOT NULL DEFAULT '{}',
      output_data JSONB NOT NULL DEFAULT '{}',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'system')),
      actor_id TEXT NOT NULL,
      notes TEXT,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS workflows_org_idx ON workflows (organization_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS workflow_runs_org_idx ON workflow_runs (organization_id, status)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS workflow_history_run_idx ON workflow_history (run_id, created_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS workflow_history');
  await pool.query('DROP TABLE IF EXISTS workflow_run_steps');
  await pool.query('DROP TABLE IF EXISTS workflow_runs');
  await pool.query('DROP TABLE IF EXISTS workflow_conditions');
  await pool.query('DROP TABLE IF EXISTS workflow_steps');
  await pool.query('DROP TABLE IF EXISTS workflows');
}
