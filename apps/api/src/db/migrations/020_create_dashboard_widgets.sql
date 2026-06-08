CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON dashboard_widgets
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_dashboard_widgets_org ON dashboard_widgets (organization_id);
CREATE INDEX idx_dashboard_widgets_org_category ON dashboard_widgets (organization_id, category);
