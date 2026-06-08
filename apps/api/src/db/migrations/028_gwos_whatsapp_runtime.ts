import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      whatsapp_phone TEXT NOT NULL,
      member_id UUID,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','waiting','completed','expired')),
      current_workflow_run_id UUID REFERENCES workflow_runs(id),
      current_intent TEXT,
      context JSONB NOT NULL DEFAULT '{}',
      step_data JSONB NOT NULL DEFAULT '{}',
      last_message_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
      message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','document','audio','video','location','template')),
      content TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      whatsapp_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS conversation_sessions_org_phone_status_idx
      ON conversation_sessions (organization_id, whatsapp_phone, status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS conversation_sessions_org_status_expires_idx
      ON conversation_sessions (organization_id, status, expires_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS conversation_messages_session_created_idx
      ON conversation_messages (session_id, created_at DESC)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP INDEX IF EXISTS conversation_messages_session_created_idx`);
  await pool.query(`DROP INDEX IF EXISTS conversation_sessions_org_status_expires_idx`);
  await pool.query(`DROP INDEX IF EXISTS conversation_sessions_org_phone_status_idx`);

  await pool.query(`DROP TABLE IF EXISTS conversation_messages`);
  await pool.query(`DROP TABLE IF EXISTS conversation_sessions`);
}
