import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Trust & Safety
    CREATE TABLE IF NOT EXISTS threat_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      threat_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'detected',
      source_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      content TEXT NOT NULL,
      indicators JSONB NOT NULL DEFAULT '{}',
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    ALTER TABLE threat_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON threat_events
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS trust_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      score FLOAT NOT NULL DEFAULT 1.0,
      flags JSONB NOT NULL DEFAULT '[]',
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, entity_id, entity_type)
    );
    ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON trust_scores
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Escalation Engine
    CREATE TABLE IF NOT EXISTS escalation_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      escalation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      escalated_to TEXT NOT NULL,
      escalated_by TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE escalation_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON escalation_records
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Recovery Engine
    CREATE TABLE IF NOT EXISTS retry_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      resource_type TEXT NOT NULL,
      max_retries INT NOT NULL DEFAULT 3,
      backoff_seconds INT NOT NULL DEFAULT 30,
      fallback_channel TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, resource_type)
    );
    ALTER TABLE retry_policies ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON retry_policies
      USING (organization_id::text = current_setting('app.current_tenant', true));

    CREATE TABLE IF NOT EXISTS retry_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      last_attempt_at TIMESTAMPTZ,
      succeeded_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE retry_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON retry_records
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Governance
    CREATE TABLE IF NOT EXISTS governance_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      action_type TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      context JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by TEXT,
      approval_note TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    ALTER TABLE governance_approvals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON governance_approvals
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS governance_approvals;
    DROP TABLE IF EXISTS retry_records;
    DROP TABLE IF EXISTS retry_policies;
    DROP TABLE IF EXISTS escalation_records;
    DROP TABLE IF EXISTS trust_scores;
    DROP TABLE IF EXISTS threat_events;
  `);
}
