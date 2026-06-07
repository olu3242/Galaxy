import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
      published_by UUID,
      published_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'all'
        CHECK (target_type IN ('all', 'department', 'team', 'role', 'custom')),
      target_ids JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
      sent_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      sent_by UUID NOT NULL,
      sent_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS communication_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      member_id UUID NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms', 'in_app')),
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      quiet_hours_start TIME,
      quiet_hours_end TIME,
      preferences JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, member_id, channel)
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS announcements_org_idx ON announcements (organization_id)`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS broadcasts_org_idx ON broadcasts (organization_id)`);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS communication_preferences');
  await pool.query('DROP TABLE IF EXISTS broadcasts');
  await pool.query('DROP TABLE IF EXISTS announcements');
}
