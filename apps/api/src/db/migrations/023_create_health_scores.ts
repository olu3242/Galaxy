import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
CREATE TABLE IF NOT EXISTS health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  category VARCHAR(50) NOT NULL,
  entity_id UUID,
  score NUMERIC NOT NULL,
  components JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON health_scores
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE TABLE IF NOT EXISTS risk_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(300) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  level VARCHAR(20) NOT NULL,
  affected_entity_id UUID,
  affected_entity_type VARCHAR(100),
  signals JSONB NOT NULL DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE risk_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON risk_indicators
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL,
  action_items TEXT[] NOT NULL DEFAULT '{}',
  related_entity_id UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON recommendations
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_health_scores_org ON health_scores (organization_id);
CREATE INDEX idx_health_scores_org_category ON health_scores (organization_id, category);
CREATE INDEX idx_risk_indicators_org ON risk_indicators (organization_id);
CREATE INDEX idx_recommendations_org ON recommendations (organization_id);
  `);
}

export async function down(_pool: Pool): Promise<void> {
  // no-op: destructive rollback not implemented for this migration
}
