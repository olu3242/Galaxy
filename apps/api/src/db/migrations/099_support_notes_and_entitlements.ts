import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // Add submitted_by column to support_tickets (if not already present)
  await pool.query(`
    ALTER TABLE support_tickets
      ADD COLUMN IF NOT EXISTS submitted_by TEXT NOT NULL DEFAULT 'unknown'
  `);

  // support_notes — internal/external notes on a support ticket
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_support_notes_ticket ON support_notes (ticket_id, created_at DESC)`,
  );

  // plan_feature_entitlements — maps plan tiers to feature availability
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_feature_entitlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_tier TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      config JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_tier, feature_key)
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_plan_feature_ents_tier ON plan_feature_entitlements (plan_tier)`,
  );

  // org_feature_overrides — per-org override of a feature's enabled state
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_feature_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      override_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, feature_key)
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_org_feature_overrides_org ON org_feature_overrides (organization_id)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS org_feature_overrides`);
  await pool.query(`DROP TABLE IF EXISTS plan_feature_entitlements`);
  await pool.query(`DROP TABLE IF EXISTS support_notes`);
  await pool.query(`ALTER TABLE support_tickets DROP COLUMN IF EXISTS submitted_by`);
}
