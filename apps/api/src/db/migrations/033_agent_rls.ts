import type { Pool } from 'pg';

const agentTables = [
  'agents',
  'agent_executions',
  'agent_memory',
  'agent_context_snapshots',
  'decision_rules',
  'decisions',
  'risk_assessments',
];

export async function up(pool: Pool): Promise<void> {
  for (const table of agentTables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await pool.query(
      `CREATE POLICY ${table}_tenant_isolation ON ${table}
       USING (organization_id::text = current_setting('app.current_tenant', true))`,
    );
  }
}

export async function down(pool: Pool): Promise<void> {
  for (const table of agentTables) {
    await pool.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
}
