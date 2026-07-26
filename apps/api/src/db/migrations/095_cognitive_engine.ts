import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id         UUID NOT NULL,
      organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      scope            TEXT NOT NULL CHECK (scope IN ('short_term', 'long_term', 'episodic', 'organizational', 'semantic')),
      key              TEXT NOT NULL,
      value            JSONB NOT NULL DEFAULT '{}',
      relevance_score  NUMERIC(5,4) NOT NULL DEFAULT 0.5,
      expires_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (agent_id, organization_id, scope, key)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_memories_org_agent
      ON agent_memories (organization_id, agent_id, scope, created_at DESC)
  `);

  await pool.query(`ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE agent_memories FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY agent_memories_tenant_isolation ON agent_memories
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_learning_events (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id         UUID NOT NULL,
      organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      execution_id     UUID NOT NULL,
      outcome          TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
      intent           TEXT NOT NULL,
      actions          JSONB NOT NULL DEFAULT '[]',
      duration_ms      INTEGER NOT NULL DEFAULT 0,
      confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
      human_escalated  BOOLEAN NOT NULL DEFAULT FALSE,
      error_message    TEXT,
      metadata         JSONB NOT NULL DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_learning_events_org_agent
      ON agent_learning_events (organization_id, agent_id, created_at DESC)
  `);

  await pool.query(`ALTER TABLE agent_learning_events ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE agent_learning_events FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY agent_learning_events_tenant_isolation ON agent_learning_events
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS agent_learning_events CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS agent_memories CASCADE`);
}
