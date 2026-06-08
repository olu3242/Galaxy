import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // partners table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('reseller', 'isv', 'si', 'technology')),
      tier TEXT NOT NULL DEFAULT 'registered' CHECK (tier IN ('registered', 'silver', 'gold', 'platinum')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
      contact_email TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // partner_deals table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      customer_org_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      deal_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'registered' CHECK (
        stage IN ('registered', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost')
      ),
      commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
      commission_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // partner_commissions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_commissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      deal_id UUID NOT NULL REFERENCES partner_deals(id) ON DELETE CASCADE,
      amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
      period TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (deal_id)
    )
  `);

  // publisher_payouts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS publisher_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'settled', 'failed')),
      period TEXT NOT NULL,
      settled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // RLS: partners scoped to organization_id
  await pool.query('ALTER TABLE partners ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE partners FORCE ROW LEVEL SECURITY');
  await pool.query(`
    CREATE POLICY partners_tenant_isolation ON partners
    USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  // RLS: partner_deals scoped via partner -> organization_id
  await pool.query('ALTER TABLE partner_deals ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE partner_deals FORCE ROW LEVEL SECURITY');
  await pool.query(`
    CREATE POLICY partner_deals_tenant_isolation ON partner_deals
    USING (
      partner_id IN (
        SELECT id FROM partners
        WHERE organization_id::text = current_setting('app.current_tenant', true)
      )
    )
  `);

  // RLS: partner_commissions scoped via partner -> organization_id
  await pool.query('ALTER TABLE partner_commissions ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE partner_commissions FORCE ROW LEVEL SECURITY');
  await pool.query(`
    CREATE POLICY partner_commissions_tenant_isolation ON partner_commissions
    USING (
      partner_id IN (
        SELECT id FROM partners
        WHERE organization_id::text = current_setting('app.current_tenant', true)
      )
    )
  `);

  // RLS: publisher_payouts scoped to organization_id
  await pool.query('ALTER TABLE publisher_payouts ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE publisher_payouts FORCE ROW LEVEL SECURITY');
  await pool.query(`
    CREATE POLICY publisher_payouts_tenant_isolation ON publisher_payouts
    USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS publisher_payouts CASCADE');
  await pool.query('DROP TABLE IF EXISTS partner_commissions CASCADE');
  await pool.query('DROP TABLE IF EXISTS partner_deals CASCADE');
  await pool.query('DROP TABLE IF EXISTS partners CASCADE');
}
