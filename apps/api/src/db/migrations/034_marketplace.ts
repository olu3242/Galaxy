import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS publishers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
      verified_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL CHECK (category IN ('workflow', 'agent', 'template', 'integration', 'report')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'suspended')),
      pricing_model TEXT NOT NULL DEFAULT 'free' CHECK (pricing_model IN ('free', 'one_time', 'subscription', 'usage_based')),
      price_amount NUMERIC(12, 4) NOT NULL DEFAULT 0,
      price_currency TEXT NOT NULL DEFAULT 'USD',
      tags TEXT[] NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      install_count INTEGER NOT NULL DEFAULT 0,
      average_rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, slug)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS installations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      marketplace_item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
      installed_by UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'uninstalled')),
      config JSONB NOT NULL DEFAULT '{}',
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      uninstalled_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      marketplace_item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
      author_id UUID NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      moderated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_billing (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      installation_id UUID NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
      marketplace_item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      usage_units INTEGER NOT NULL DEFAULT 0,
      fee_amount NUMERIC(12, 4) NOT NULL DEFAULT 0,
      fee_currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_marketplace_items_org ON marketplace_items(organization_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_marketplace_items_category ON marketplace_items(category)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_installations_org ON installations(organization_id)`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_item ON reviews(marketplace_item_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_billing_org ON marketplace_billing(organization_id)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS marketplace_billing CASCADE');
  await pool.query('DROP TABLE IF EXISTS reviews CASCADE');
  await pool.query('DROP TABLE IF EXISTS installations CASCADE');
  await pool.query('DROP TABLE IF EXISTS marketplace_items CASCADE');
  await pool.query('DROP TABLE IF EXISTS publishers CASCADE');
}
