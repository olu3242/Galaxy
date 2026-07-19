import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),
      monthly_price_cents INTEGER NOT NULL DEFAULT 0,
      annual_price_cents INTEGER NOT NULL DEFAULT 0,
      max_members INTEGER NOT NULL DEFAULT 10,
      max_workflows INTEGER NOT NULL DEFAULT 5,
      max_agents INTEGER NOT NULL DEFAULT 2,
      api_calls_per_month INTEGER NOT NULL DEFAULT 1000,
      storage_mb INTEGER NOT NULL DEFAULT 1024,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    INSERT INTO plans (name, tier, monthly_price_cents, annual_price_cents, max_members, max_workflows, max_agents, api_calls_per_month, storage_mb)
    VALUES
      ('Starter', 'starter', 0, 0, 10, 5, 2, 1000, 1024),
      ('Professional', 'professional', 4900, 49000, 50, 50, 10, 50000, 10240),
      ('Enterprise', 'enterprise', 19900, 199000, 9999, 9999, 9999, 9999999, 1048576)
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id),
      status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
      current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_period_end TIMESTAMPTZ NOT NULL,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
      trial_end TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES subscriptions(id),
      status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      due_date TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ,
      line_items JSONB NOT NULL DEFAULT '[]',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES subscriptions(id),
      event_type TEXT NOT NULL CHECK (event_type IN ('workflow_run', 'agent_execution', 'api_call', 'storage_mb', 'member_seat')),
      quantity INTEGER NOT NULL DEFAULT 1,
      metadata JSONB NOT NULL DEFAULT '{}',
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_events_org ON usage_events(organization_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_subscription ON usage_events(subscription_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_recorded_at ON usage_events(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(event_type);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_summaries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES subscriptions(id),
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      workflow_runs INTEGER NOT NULL DEFAULT 0,
      agent_executions INTEGER NOT NULL DEFAULT 0,
      api_calls INTEGER NOT NULL DEFAULT 0,
      storage_mb INTEGER NOT NULL DEFAULT 0,
      member_seats INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (subscription_id, period_start, period_end)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_summaries_org ON usage_summaries(organization_id);
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS usage_summaries CASCADE');
  await pool.query('DROP TABLE IF EXISTS usage_events CASCADE');
  await pool.query('DROP TABLE IF EXISTS invoices CASCADE');
  await pool.query('DROP TABLE IF EXISTS subscriptions CASCADE');
  await pool.query('DROP TABLE IF EXISTS plans CASCADE');
}
