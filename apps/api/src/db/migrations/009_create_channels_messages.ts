import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      channel_type TEXT NOT NULL DEFAULT 'group'
        CHECK (channel_type IN ('direct', 'group', 'broadcast', 'announcement')),
      is_archived BOOLEAN NOT NULL DEFAULT false,
      created_by UUID NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      member_id UUID NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (channel_id, member_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL,
      thread_id UUID,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text'
        CHECK (content_type IN ('text', 'image', 'file', 'audio', 'video', 'template')),
      status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      parent_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      reply_count INT NOT NULL DEFAULT 0,
      last_reply_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS channels_org_idx ON channels (organization_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS channel_members_channel_idx ON channel_members (channel_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id, created_at DESC)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS message_threads');
  await pool.query('DROP TABLE IF EXISTS messages');
  await pool.query('DROP TABLE IF EXISTS channel_members');
  await pool.query('DROP TABLE IF EXISTS channels');
}
