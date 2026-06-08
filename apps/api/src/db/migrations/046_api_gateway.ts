import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // gateway_routes — system-level table, no organization_id, no RLS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gateway_routes (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      path             TEXT NOT NULL,
      method           TEXT NOT NULL,
      version          TEXT NOT NULL DEFAULT 'v1',
      auth_required    BOOLEAN NOT NULL DEFAULT true,
      rate_limit_tier  TEXT NOT NULL DEFAULT 'basic',
      description      TEXT NOT NULL DEFAULT '',
      is_active        BOOLEAN NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (path, method, version)
    )
  `);

  // api_request_logs — tenant-scoped, RLS enforced
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_request_logs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      api_key_id      UUID NOT NULL,
      endpoint        TEXT NOT NULL,
      method          TEXT NOT NULL,
      status_code     INTEGER NOT NULL,
      latency_ms      INTEGER NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // rate_limit_windows — used by GatewayRateLimitService for JSONB-backed counters
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_windows (
      api_key_id      UUID NOT NULL,
      organization_id UUID NOT NULL,
      window_start    TIMESTAMPTZ NOT NULL,
      count           INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (api_key_id, window_start)
    )
  `);

  // Indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_request_logs_org_created
      ON api_request_logs (organization_id, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_created
      ON api_request_logs (api_key_id, created_at)
  `);

  // RLS on api_request_logs
  await pool.query(`ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE api_request_logs FORCE ROW LEVEL SECURITY`);
  await pool.query(`
    DROP POLICY IF EXISTS api_request_logs_tenant_isolation ON api_request_logs;
    CREATE POLICY api_request_logs_tenant_isolation ON api_request_logs
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
  // Allow inserts without tenant context (logging happens server-side)
  await pool.query(`
    DROP POLICY IF EXISTS api_request_logs_insert ON api_request_logs;
    CREATE POLICY api_request_logs_insert ON api_request_logs
      FOR INSERT WITH CHECK (true)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP POLICY IF EXISTS api_request_logs_insert ON api_request_logs`);
  await pool.query(`DROP POLICY IF EXISTS api_request_logs_tenant_isolation ON api_request_logs`);
  await pool.query(`ALTER TABLE api_request_logs DISABLE ROW LEVEL SECURITY`);
  await pool.query(`DROP TABLE IF EXISTS rate_limit_windows`);
  await pool.query(`DROP TABLE IF EXISTS api_request_logs`);
  await pool.query(`DROP TABLE IF EXISTS gateway_routes`);
}
