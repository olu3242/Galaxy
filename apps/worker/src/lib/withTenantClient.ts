import type { Pool, PoolClient } from 'pg';

/**
 * Checks out a dedicated PoolClient, sets app.current_tenant at session level
 * (set_config false = persists for the connection's lifetime, not just one
 * transaction), runs the callback, then resets and releases the client.
 *
 * This is the correct pattern for workers that need RLS context: pool.query()
 * can return a different connection on each call, so set_config(true) on one
 * call will not apply to the next. Using a dedicated client guarantees all
 * queries in the callback see the same tenant context.
 */
export async function withTenantClient<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant', tenantId]);
    return await fn(client);
  } finally {
    await client
      .query('SELECT set_config($1, $2, false)', ['app.current_tenant', ''])
      .catch(() => null);
    client.release();
  }
}
