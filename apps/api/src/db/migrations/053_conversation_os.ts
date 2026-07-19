import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      channel_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      intent TEXT,
      language TEXT,
      sentiment TEXT,
      urgency_score FLOAT,
      risk_score FLOAT,
      context JSONB NOT NULL DEFAULT '{}',
      memory JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      UNIQUE(organization_id, channel_type, external_id)
    );
    ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON conversation_sessions
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      content TEXT NOT NULL,
      raw_payload JSONB NOT NULL DEFAULT '{}',
      intent TEXT,
      entities JSONB NOT NULL DEFAULT '{}',
      sentiment TEXT,
      language TEXT,
      translated_content TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON conversation_messages
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS conversation_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      topic TEXT,
      summary TEXT,
      message_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON conversation_threads
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS conversation_threads;
    DROP TABLE IF EXISTS conversation_messages;
    DROP TABLE IF EXISTS conversation_sessions;
  `);
}
