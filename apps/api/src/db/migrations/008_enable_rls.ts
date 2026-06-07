import type { Pool } from 'pg';

/**
 * Enable Row-Level Security on all tenant-scoped tables and create policies.
 *
 * RLS policy: organization_id must match the current tenant set via
 * SELECT set_config('app.current_tenant', $1, true)
 *
 * audit_logs: INSERT-only for app role; SELECT only for auditor role.
 */
export async function up(pool: Pool): Promise<void> {
  const tenantTables = [
    'organization_settings',
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'memberships',
    'departments',
    'teams',
    'team_members',
    'events',
    'audit_logs',
  ];

  for (const table of tenantTables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  }

  // Standard tenant isolation policies for all tables except audit_logs
  const standardTables = tenantTables.filter((t) => t !== 'audit_logs');

  for (const table of standardTables) {
    await pool.query(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (organization_id::text = current_setting('app.current_tenant', true))
    `);
  }

  // audit_logs: INSERT-only for app (no SELECT policy means no reads for normal role)
  await pool.query(`
    CREATE POLICY audit_logs_insert_only ON audit_logs
      FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);

  // audit_logs: SELECT policy for auditor role only
  await pool.query(`
    CREATE POLICY audit_logs_auditor_select ON audit_logs
      FOR SELECT
      USING (
        current_setting('app.current_tenant', true) != ''
        AND organization_id::text = current_setting('app.current_tenant', true)
        AND current_setting('app.current_role', true) = 'auditor'
      )
  `);
}

export async function down(pool: Pool): Promise<void> {
  const tables = [
    'organization_settings',
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'memberships',
    'departments',
    'teams',
    'team_members',
    'events',
    'audit_logs',
  ];

  for (const table of tables) {
    await pool.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }

  await pool.query('DROP POLICY IF EXISTS audit_logs_insert_only ON audit_logs');
  await pool.query('DROP POLICY IF EXISTS audit_logs_auditor_select ON audit_logs');
}
