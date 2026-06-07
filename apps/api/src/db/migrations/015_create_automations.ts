import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT false,
      trigger_event TEXT NOT NULL,
      trigger_conditions JSONB NOT NULL DEFAULT '[]',
      actions JSONB NOT NULL DEFAULT '[]',
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      trigger_event_type TEXT NOT NULL,
      trigger_data JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
      result JSONB NOT NULL DEFAULT '{}',
      error_message TEXT,
      correlation_id UUID NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS automations_org_idx ON automations (organization_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS automations_trigger_idx ON automations (organization_id, trigger_event, is_active)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS automation_executions_automation_idx ON automation_executions (automation_id, created_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS automation_executions');
  await pool.query('DROP TABLE IF EXISTS automations');
}
