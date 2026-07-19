import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  const tables = ['api_keys', 'webhooks', 'webhook_deliveries', 'oauth_apps', 'oauth_tokens'];

  for (const table of tables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    await pool.query(`
      DROP POLICY IF EXISTS tenant_isolation ON ${table};
      CREATE POLICY tenant_isolation ON ${table}
        USING (organization_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  // rate_limit_events is an append-only operational table — allow inserts without tenant context
  await pool.query(`ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DROP POLICY IF EXISTS rate_limit_select ON rate_limit_events;
    CREATE POLICY rate_limit_select ON rate_limit_events
      USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  `);
  await pool.query(`
    DROP POLICY IF EXISTS rate_limit_insert ON rate_limit_events;
    CREATE POLICY rate_limit_insert ON rate_limit_events FOR INSERT WITH CHECK (true)
  `);
}

export async function down(pool: Pool): Promise<void> {
  const tables = [
    'api_keys',
    'webhooks',
    'webhook_deliveries',
    'oauth_apps',
    'oauth_tokens',
    'rate_limit_events',
  ];

  for (const table of tables) {
    await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
    await pool.query(`DROP POLICY IF EXISTS rate_limit_select ON ${table}`);
    await pool.query(`DROP POLICY IF EXISTS rate_limit_insert ON ${table}`);
  }
}
