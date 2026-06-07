import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
      subject TEXT,
      body TEXT NOT NULL,
      variables JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, name, channel)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL,
      template_id UUID REFERENCES notification_templates(id),
      channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
      read_at TIMESTAMPTZ,
      data JSONB NOT NULL DEFAULT '{}',
      correlation_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
      provider_message_id TEXT,
      error_message TEXT,
      attempted_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      member_id UUID NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
      notification_type TEXT NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, member_id, channel, notification_type)
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (organization_id, recipient_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (status, created_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS notification_preferences');
  await pool.query('DROP TABLE IF EXISTS notification_deliveries');
  await pool.query('DROP TABLE IF EXISTS notifications');
  await pool.query('DROP TABLE IF EXISTS notification_templates');
}
