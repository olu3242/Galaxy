import type { Pool, PoolClient } from 'pg';

export async function withTenantClient<T>(
  pool: Pool,
  organizationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    return await fn(client);
  } finally {
    client.release();
  }
}
