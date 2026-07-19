import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE agent_memory (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id         UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      memory_type      TEXT        NOT NULL,
      key              TEXT        NOT NULL,
      value            JSONB       NOT NULL DEFAULT '{}',
      relevance_score  NUMERIC(5,2) NOT NULL DEFAULT 1.0,
      expires_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, agent_id, memory_type, key)
    )
  `);

  await pool.query(`
    CREATE TABLE agent_context_snapshots (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id          UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      execution_id      UUID        REFERENCES agent_executions(id) ON DELETE SET NULL,
      context_data      JSONB       NOT NULL DEFAULT '{}',
      workflow_runs     JSONB       NOT NULL DEFAULT '[]',
      pending_approvals JSONB       NOT NULL DEFAULT '[]',
      recent_decisions  JSONB       NOT NULL DEFAULT '[]',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX idx_agent_memory_agent ON agent_memory(organization_id, agent_id)`,
  );
  await pool.query(
    `CREATE INDEX idx_agent_memory_type ON agent_memory(organization_id, agent_id, memory_type)`,
  );
  await pool.query(
    `CREATE INDEX idx_agent_memory_expires ON agent_memory(expires_at) WHERE expires_at IS NOT NULL`,
  );
  await pool.query(
    `CREATE INDEX idx_context_snapshots_agent ON agent_context_snapshots(organization_id, agent_id)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS agent_context_snapshots`);
  await pool.query(`DROP TABLE IF EXISTS agent_memory`);
}
