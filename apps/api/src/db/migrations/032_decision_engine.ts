import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE decision_rules (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name             TEXT        NOT NULL,
      description      TEXT,
      automation_domain TEXT       NOT NULL,
      conditions       JSONB       NOT NULL DEFAULT '[]',
      action           TEXT        NOT NULL,
      priority         INTEGER     NOT NULL DEFAULT 0,
      is_active        BOOLEAN     NOT NULL DEFAULT true,
      created_by       TEXT        NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE decisions (
      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id               UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      execution_id           UUID        REFERENCES agent_executions(id) ON DELETE SET NULL,
      decision_type          TEXT        NOT NULL,
      subject                TEXT        NOT NULL,
      context                JSONB       NOT NULL DEFAULT '{}',
      outcome                TEXT        NOT NULL,
      confidence_score       NUMERIC(5,2) NOT NULL,
      reasoning              TEXT        NOT NULL,
      rule_ids               TEXT[]      NOT NULL DEFAULT '{}',
      requires_human_override BOOLEAN    NOT NULL DEFAULT false,
      human_override_by      TEXT,
      human_override_at      TIMESTAMPTZ,
      human_override_reason  TEXT,
      correlation_id         TEXT        NOT NULL,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE risk_assessments (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      agent_id          UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      execution_id      UUID        REFERENCES agent_executions(id) ON DELETE SET NULL,
      subject_type      TEXT        NOT NULL,
      subject_id        TEXT        NOT NULL,
      risk_score        NUMERIC(5,2) NOT NULL,
      risk_level        TEXT        NOT NULL,
      risk_factors      JSONB       NOT NULL DEFAULT '[]',
      recommended_action TEXT,
      correlation_id    TEXT        NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX idx_decision_rules_org ON decision_rules(organization_id)`);
  await pool.query(
    `CREATE INDEX idx_decision_rules_domain ON decision_rules(organization_id, automation_domain)`,
  );
  await pool.query(`CREATE INDEX idx_decisions_org ON decisions(organization_id)`);
  await pool.query(`CREATE INDEX idx_decisions_agent ON decisions(organization_id, agent_id)`);
  await pool.query(
    `CREATE INDEX idx_decisions_override ON decisions(organization_id, requires_human_override) WHERE requires_human_override = true`,
  );
  await pool.query(`CREATE INDEX idx_risk_assessments_org ON risk_assessments(organization_id)`);
  await pool.query(
    `CREATE INDEX idx_risk_assessments_level ON risk_assessments(organization_id, risk_level)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS risk_assessments`);
  await pool.query(`DROP TABLE IF EXISTS decisions`);
  await pool.query(`DROP TABLE IF EXISTS decision_rules`);
}
