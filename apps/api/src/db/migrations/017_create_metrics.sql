CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  value NUMERIC NOT NULL,
  unit VARCHAR(50) NOT NULL,
  period VARCHAR(20) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON metrics
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_metrics_org_name ON metrics (organization_id, name);
CREATE INDEX idx_metrics_org_category ON metrics (organization_id, category);
CREATE INDEX idx_metrics_period_start ON metrics (period_start);
