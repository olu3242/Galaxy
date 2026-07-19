import type { Pool } from 'pg';

const tenantTables = [
  'integration_connectors',
  'integration_sync_logs',
  'integration_event_mappings',
  'integration_event_deliveries',
  'solution_pack_installations',
];

export async function up(pool: Pool): Promise<void> {
  for (const table of tenantTables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await pool.query(
      `CREATE POLICY ${table}_tenant_isolation ON ${table}
       USING (organization_id::text = current_setting('app.current_tenant', true))`,
    );
  }

  // workflow_templates: allow system templates (organization_id IS NULL) or org-owned
  await pool.query(`ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE workflow_templates FORCE ROW LEVEL SECURITY`);
  await pool.query(
    `CREATE POLICY workflow_templates_tenant_isolation ON workflow_templates
     USING (
       organization_id IS NULL
       OR organization_id::text = current_setting('app.current_tenant', true)
     )`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(
    `DROP POLICY IF EXISTS workflow_templates_tenant_isolation ON workflow_templates`,
  );
  await pool.query(`ALTER TABLE workflow_templates DISABLE ROW LEVEL SECURITY`);

  for (const table of [...tenantTables].reverse()) {
    await pool.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
}
