import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      hashed_secret TEXT NOT NULL UNIQUE,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hashed_secret ON api_keys(hashed_secret);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      event_types TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'failed')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_delivered_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(organization_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'dead_letter')),
      response_status INTEGER,
      response_body TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org ON webhook_deliveries(organization_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_apps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      client_id TEXT NOT NULL UNIQUE,
      hashed_client_secret TEXT NOT NULL,
      redirect_uris TEXT[] NOT NULL DEFAULT '{}',
      scopes TEXT[] NOT NULL DEFAULT '{}',
      grant_types TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_oauth_apps_org ON oauth_apps(organization_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_apps_client_id ON oauth_apps(client_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      oauth_app_id UUID NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
      member_id UUID,
      access_token TEXT NOT NULL UNIQUE,
      refresh_token TEXT UNIQUE,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_org ON oauth_tokens(organization_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_access_token ON oauth_tokens(access_token);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_status ON oauth_tokens(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key_id TEXT NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rate_limit_events_org_key ON rate_limit_events(organization_id, key_id, recorded_at);
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS rate_limit_events CASCADE');
  await pool.query('DROP TABLE IF EXISTS oauth_tokens CASCADE');
  await pool.query('DROP TABLE IF EXISTS oauth_apps CASCADE');
  await pool.query('DROP TABLE IF EXISTS webhook_deliveries CASCADE');
  await pool.query('DROP TABLE IF EXISTS webhooks CASCADE');
  await pool.query('DROP TABLE IF EXISTS api_keys CASCADE');
}
