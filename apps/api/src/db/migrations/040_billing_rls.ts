import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // Enable RLS on billing tables
  for (const table of ['subscriptions', 'invoices', 'usage_events', 'usage_summaries']) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    await pool.query(`
      DROP POLICY IF EXISTS tenant_isolation ON ${table};
      CREATE POLICY tenant_isolation ON ${table}
        USING (organization_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  // plans table is global (no org isolation needed), but protect from mutations via app
  await pool.query(`ALTER TABLE plans ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DROP POLICY IF EXISTS plans_read_all ON plans;
    CREATE POLICY plans_read_all ON plans FOR SELECT USING (true)
  `);
}

export async function down(pool: Pool): Promise<void> {
  for (const table of ['subscriptions', 'invoices', 'usage_events', 'usage_summaries', 'plans']) {
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
    await pool.query(`DROP POLICY IF EXISTS plans_read_all ON ${table}`);
  }
}
