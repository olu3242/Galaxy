import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      workflow_run_id UUID REFERENCES workflow_runs(id),
      correlation_id UUID NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INT,
      completion_tokens INT,
      total_tokens INT,
      latency_ms INT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      execution_id UUID NOT NULL REFERENCES ai_executions(id) ON DELETE CASCADE,
      decision_type TEXT NOT NULL CHECK (decision_type IN ('intent_detection','classification','task_extraction','risk_detection','recommendation','summary','sop_generation')),
      input JSONB NOT NULL DEFAULT '{}',
      output JSONB NOT NULL DEFAULT '{}',
      confidence_score NUMERIC(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
      human_override BOOLEAN NOT NULL DEFAULT false,
      override_actor_id UUID,
      override_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS intent_detections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      ai_decision_id UUID REFERENCES ai_decisions(id),
      source_type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source_type IN ('whatsapp','api','web','scheduled')),
      source_id TEXT,
      raw_input TEXT NOT NULL,
      detected_intent TEXT NOT NULL,
      automation_domain TEXT,
      flow_type TEXT,
      matched_workflow_id UUID REFERENCES workflows(id),
      workflow_run_id UUID REFERENCES workflow_runs(id),
      confidence_score NUMERIC(4,3),
      requires_human_review BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ai_executions_org_status_created_idx
      ON ai_executions (organization_id, status, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ai_decisions_execution_idx
      ON ai_decisions (execution_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS intent_detections_org_source_created_idx
      ON intent_detections (organization_id, source_type, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS intent_detections_org_intent_idx
      ON intent_detections (organization_id, detected_intent)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP INDEX IF EXISTS intent_detections_org_intent_idx`);
  await pool.query(`DROP INDEX IF EXISTS intent_detections_org_source_created_idx`);
  await pool.query(`DROP INDEX IF EXISTS ai_decisions_execution_idx`);
  await pool.query(`DROP INDEX IF EXISTS ai_executions_org_status_created_idx`);

  await pool.query(`DROP TABLE IF EXISTS intent_detections`);
  await pool.query(`DROP TABLE IF EXISTS ai_decisions`);
  await pool.query(`DROP TABLE IF EXISTS ai_executions`);
}
