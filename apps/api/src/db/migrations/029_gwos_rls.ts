import type { Pool } from 'pg';

const gwosTables = [
  'workflow_packs',
  'event_consumers',
  'event_subscriptions',
  'event_retries',
  'event_dead_letters',
  'ai_executions',
  'ai_decisions',
  'intent_detections',
  'conversation_sessions',
  'conversation_messages',
];

export async function up(pool: Pool): Promise<void> {
  for (const table of gwosTables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await pool.query(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (organization_id::text = current_setting('app.current_tenant', true))
    `);
  }
}

export async function down(pool: Pool): Promise<void> {
  for (const table of [...gwosTables].reverse()) {
    await pool.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
}
