import type { Pool } from 'pg';

const sprint2Tables = [
  'channels',
  'channel_members',
  'messages',
  'message_threads',
  'announcements',
  'broadcasts',
  'communication_preferences',
  'notification_templates',
  'notifications',
  'notification_deliveries',
  'notification_preferences',
  'workflows',
  'workflow_steps',
  'workflow_conditions',
  'workflow_runs',
  'workflow_run_steps',
  'workflow_history',
  'tasks',
  'task_assignments',
  'task_comments',
  'task_dependencies',
  'task_history',
  'approvals',
  'approval_steps',
  'approval_decisions',
  'approval_history',
  'automations',
  'automation_executions',
];

export async function up(pool: Pool): Promise<void> {
  for (const table of sprint2Tables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await pool.query(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (organization_id::text = current_setting('app.current_tenant', true))
    `);
  }
}

export async function down(pool: Pool): Promise<void> {
  for (const table of [...sprint2Tables].reverse()) {
    await pool.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
}
