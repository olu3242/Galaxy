import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // conversation_sessions was created in 028 with a WhatsApp-specific schema.
  // Add multi-channel Conversation OS columns.
  await pool.query(`
    ALTER TABLE conversation_sessions
      ADD COLUMN IF NOT EXISTS channel_type TEXT,
      ADD COLUMN IF NOT EXISTS external_id TEXT,
      ADD COLUMN IF NOT EXISTS participant_id TEXT,
      ADD COLUMN IF NOT EXISTS intent TEXT,
      ADD COLUMN IF NOT EXISTS language TEXT,
      ADD COLUMN IF NOT EXISTS sentiment TEXT,
      ADD COLUMN IF NOT EXISTS urgency_score FLOAT,
      ADD COLUMN IF NOT EXISTS risk_score FLOAT,
      ADD COLUMN IF NOT EXISTS memory JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ
  `);
  await pool.query(`ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DROP POLICY IF EXISTS tenant_isolation ON conversation_sessions;
    CREATE POLICY tenant_isolation ON conversation_sessions
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  // conversation_messages was created in 028; add NLP enrichment columns.
  await pool.query(`
    ALTER TABLE conversation_messages
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received',
      ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS intent TEXT,
      ADD COLUMN IF NOT EXISTS entities JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS sentiment TEXT,
      ADD COLUMN IF NOT EXISTS language TEXT,
      ADD COLUMN IF NOT EXISTS translated_content TEXT
  `);
  await pool.query(`ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DROP POLICY IF EXISTS tenant_isolation ON conversation_messages;
    CREATE POLICY tenant_isolation ON conversation_messages
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  // conversation_threads is new in this migration.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      topic TEXT,
      summary TEXT,
      message_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    DROP POLICY IF EXISTS tenant_isolation ON conversation_threads;
    CREATE POLICY tenant_isolation ON conversation_threads
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS conversation_threads`);
  await pool.query(`
    ALTER TABLE conversation_messages
      DROP COLUMN IF EXISTS translated_content,
      DROP COLUMN IF EXISTS language,
      DROP COLUMN IF EXISTS sentiment,
      DROP COLUMN IF EXISTS entities,
      DROP COLUMN IF EXISTS intent,
      DROP COLUMN IF EXISTS raw_payload,
      DROP COLUMN IF EXISTS status
  `);
  await pool.query(`
    ALTER TABLE conversation_sessions
      DROP COLUMN IF EXISTS closed_at,
      DROP COLUMN IF EXISTS memory,
      DROP COLUMN IF EXISTS risk_score,
      DROP COLUMN IF EXISTS urgency_score,
      DROP COLUMN IF EXISTS sentiment,
      DROP COLUMN IF EXISTS language,
      DROP COLUMN IF EXISTS intent,
      DROP COLUMN IF EXISTS participant_id,
      DROP COLUMN IF EXISTS external_id,
      DROP COLUMN IF EXISTS channel_type
  `);
}
