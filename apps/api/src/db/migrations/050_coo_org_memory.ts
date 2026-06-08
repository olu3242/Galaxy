import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // Digital COO briefings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coo_briefings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      health_score INTEGER NOT NULL DEFAULT 100,
      executive_summary TEXT NOT NULL DEFAULT '',
      critical_alert_count INTEGER NOT NULL DEFAULT 0,
      autonomous_action_count INTEGER NOT NULL DEFAULT 0,
      pending_action_count INTEGER NOT NULL DEFAULT 0,
      briefing_data JSONB NOT NULL DEFAULT '{}',
      correlation_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // COO actions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coo_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      briefing_id UUID REFERENCES coo_briefings(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL CHECK (
        action_type IN ('notify_approver','escalate_workflow','reassign_task','alert_compliance','suggest_knowledge_doc')
      ),
      subject TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('observe','notify','suggest','act','command')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed')),
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      rejected_by TEXT,
      rejected_at TIMESTAMPTZ,
      rejection_reason TEXT,
      executed_at TIMESTAMPTZ,
      correlation_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reasoning TEXT NOT NULL DEFAULT ''
    )
  `);

  // Org memory
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_memories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      memory_type TEXT NOT NULL CHECK (
        memory_type IN ('decision','pattern','lesson','preference','constraint')
      ),
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
      relevance_tags TEXT[] NOT NULL DEFAULT '{}',
      is_valid BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // RLS
  for (const table of ['coo_briefings', 'coo_actions', 'org_memories']) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (organization_id::text = current_setting('app.current_tenant', true))
    `);
  }

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_coo_briefings_org ON coo_briefings(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_coo_actions_org ON coo_actions(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_org_memories_org ON org_memories(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_org_memories_type ON org_memories(organization_id, memory_type)',
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS org_memories CASCADE');
  await pool.query('DROP TABLE IF EXISTS coo_actions CASCADE');
  await pool.query('DROP TABLE IF EXISTS coo_briefings CASCADE');
}
