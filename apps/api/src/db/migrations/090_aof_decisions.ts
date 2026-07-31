import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aof_decisions (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      decision                TEXT NOT NULL,
      priority                TEXT NOT NULL CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
      confidence              NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      execution_strategy      TEXT NOT NULL CHECK (execution_strategy IN ('parallel', 'sequential', 'deferred')),
      estimated_completion_ms INTEGER,
      risk_level              TEXT NOT NULL CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
      rationale               TEXT NOT NULL,
      governance_verdict      JSONB NOT NULL DEFAULT '{}',
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_decisions_org_created
      ON aof_decisions (organization_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS aof_decisions_org_priority
      ON aof_decisions (organization_id, priority, created_at DESC)
  `);

  await pool.query(`ALTER TABLE aof_decisions ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE aof_decisions FORCE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY aof_decisions_tenant_isolation
      ON aof_decisions
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);

  await pool.query(`
    CREATE POLICY aof_decisions_insert
      ON aof_decisions FOR INSERT
      WITH CHECK (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS aof_decisions CASCADE`);
}
