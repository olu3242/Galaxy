CREATE TABLE IF NOT EXISTS intelligence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE intelligence_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON intelligence_snapshots
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_intelligence_snapshots_org ON intelligence_snapshots (organization_id);
CREATE INDEX idx_intelligence_snapshots_org_type ON intelligence_snapshots (organization_id, type);
CREATE INDEX idx_intelligence_snapshots_generated_at ON intelligence_snapshots (generated_at);
