import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // members table — flat user-in-org record used by platform-admin queries
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_members_org ON members (organization_id, created_at DESC)`,
  );
  await pool.query(`ALTER TABLE members ENABLE ROW LEVEL SECURITY`);
  await pool.query(`DROP POLICY IF EXISTS members_tenant ON members`);
  await pool.query(`
    CREATE POLICY members_tenant ON members
      USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  `);

  // platform_audit_logs — platform-admin audit table (no RLS; superadmin scope)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_org ON platform_audit_logs (organization_id, created_at DESC)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON platform_audit_logs (action, created_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS platform_audit_logs`);
  await pool.query(`DROP TABLE IF EXISTS members`);
}
