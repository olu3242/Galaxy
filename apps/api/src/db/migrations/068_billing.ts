import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Billing accounts (org-scoped)
    CREATE TABLE IF NOT EXISTS billing_accounts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      currency         TEXT NOT NULL DEFAULT 'USD',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS billing_accounts_tenant ON billing_accounts;
    CREATE POLICY billing_accounts_tenant ON billing_accounts
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_billing_accounts_org ON billing_accounts (organization_id);

    -- Billing profiles (org-scoped)
    CREATE TABLE IF NOT EXISTS billing_profiles (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      billing_name     TEXT NOT NULL,
      billing_email    TEXT NOT NULL,
      address          JSONB NOT NULL DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS billing_profiles_tenant ON billing_profiles;
    CREATE POLICY billing_profiles_tenant ON billing_profiles
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Invoices (org-scoped)
    CREATE TABLE IF NOT EXISTS invoices (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      amount_cents     BIGINT NOT NULL DEFAULT 0,
      currency         TEXT NOT NULL DEFAULT 'USD',
      status           TEXT NOT NULL DEFAULT 'draft',
      due_date         TIMESTAMPTZ,
      paid_at          TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS invoices_tenant ON invoices;
    CREATE POLICY invoices_tenant ON invoices
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices (organization_id, created_at DESC);

    -- Invoice items (org-scoped)
    CREATE TABLE IF NOT EXISTS invoice_items (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      organization_id  UUID NOT NULL,
      description      TEXT NOT NULL,
      quantity         INTEGER NOT NULL DEFAULT 1,
      unit_price_cents BIGINT NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS invoice_items_tenant ON invoice_items;
    CREATE POLICY invoice_items_tenant ON invoice_items
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Payments (org-scoped)
    CREATE TABLE IF NOT EXISTS payments (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      invoice_id       UUID REFERENCES invoices(id) ON DELETE SET NULL,
      amount_cents     BIGINT NOT NULL DEFAULT 0,
      currency         TEXT NOT NULL DEFAULT 'USD',
      status           TEXT NOT NULL DEFAULT 'pending',
      paid_at          TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS payments_tenant ON payments;
    CREATE POLICY payments_tenant ON payments
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_payments_org ON payments (organization_id, created_at DESC);

    -- Credits (org-scoped)
    CREATE TABLE IF NOT EXISTS credits (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      amount_cents     BIGINT NOT NULL DEFAULT 0,
      reason           TEXT NOT NULL,
      expires_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS credits_tenant ON credits;
    CREATE POLICY credits_tenant ON credits
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Plans (global)
    CREATE TABLE IF NOT EXISTS plans (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                   TEXT NOT NULL UNIQUE,
      display_name           TEXT NOT NULL,
      price_cents_monthly    BIGINT NOT NULL DEFAULT 0,
      price_cents_annual     BIGINT NOT NULL DEFAULT 0,
      features               JSONB NOT NULL DEFAULT '{}',
      active                 BOOLEAN NOT NULL DEFAULT true,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Subscriptions (org-scoped)
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL,
      plan_id               UUID NOT NULL REFERENCES plans(id),
      status                TEXT NOT NULL DEFAULT 'active',
      trial_ends_at         TIMESTAMPTZ,
      current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_period_end    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 month',
      cancelled_at          TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS subscriptions_tenant ON subscriptions;
    CREATE POLICY subscriptions_tenant ON subscriptions
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions (organization_id, created_at DESC);

    -- Subscription events (org-scoped)
    CREATE TABLE IF NOT EXISTS subscription_events (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID NOT NULL,
      subscription_id  UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      event_type       TEXT NOT NULL,
      metadata         JSONB NOT NULL DEFAULT '{}',
      occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS subscription_events_tenant ON subscription_events;
    CREATE POLICY subscription_events_tenant ON subscription_events
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS subscription_events;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS plans;
    DROP TABLE IF EXISTS credits;
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS invoice_items;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS billing_profiles;
    DROP TABLE IF EXISTS billing_accounts;
  `);
}
