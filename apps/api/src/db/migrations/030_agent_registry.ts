import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE agents (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name             TEXT        NOT NULL,
      description      TEXT,
      agent_type       TEXT        NOT NULL,
      capabilities     TEXT[]      NOT NULL DEFAULT '{}',
      automation_domains TEXT[]    NOT NULL DEFAULT '{}',
      config           JSONB       NOT NULL DEFAULT '{}',
      is_active        BOOLEAN     NOT NULL DEFAULT true,
      version          INTEGER     NOT NULL DEFAULT 1,
      created_by       TEXT        NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE agent_executions (
      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id               UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      trigger_type           TEXT        NOT NULL,
      trigger_data           JSONB       NOT NULL DEFAULT '{}',
      status                 TEXT        NOT NULL DEFAULT 'pending',
      input                  JSONB       NOT NULL DEFAULT '{}',
      output                 JSONB       NOT NULL DEFAULT '{}',
      decisions              JSONB       NOT NULL DEFAULT '[]',
      recommendations        JSONB       NOT NULL DEFAULT '[]',
      risk_score             NUMERIC(5,2),
      requires_human_approval BOOLEAN    NOT NULL DEFAULT false,
      human_approved_by      TEXT,
      human_approved_at      TIMESTAMPTZ,
      correlation_id         TEXT        NOT NULL,
      started_at             TIMESTAMPTZ,
      completed_at           TIMESTAMPTZ,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX idx_agents_org ON agents(organization_id)`);
  await pool.query(`CREATE INDEX idx_agents_type ON agents(organization_id, agent_type)`);
  await pool.query(`CREATE INDEX idx_agent_executions_org ON agent_executions(organization_id)`);
  await pool.query(
    `CREATE INDEX idx_agent_executions_agent ON agent_executions(organization_id, agent_id)`,
  );
  await pool.query(
    `CREATE INDEX idx_agent_executions_status ON agent_executions(organization_id, status)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS agent_executions`);
  await pool.query(`DROP TABLE IF EXISTS agents`);
}
