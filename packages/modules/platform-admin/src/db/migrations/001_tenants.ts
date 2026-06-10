export const up = `
CREATE TABLE IF NOT EXISTS tenant_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE,
  max_members INTEGER NOT NULL DEFAULT 25,
  max_workflows INTEGER NOT NULL DEFAULT 50,
  max_agents INTEGER NOT NULL DEFAULT 3,
  api_calls_per_month INTEGER NOT NULL DEFAULT 10000,
  storage_mb INTEGER NOT NULL DEFAULT 512,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  health_score INTEGER NOT NULL DEFAULT 100,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  performed_by VARCHAR(255) NOT NULL DEFAULT 'system',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_lifecycle_org ON tenant_lifecycle (organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_health_org ON tenant_health (organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_org_period ON tenant_usage (organization_id, period_start);
`;

export const down = `
DROP TABLE IF EXISTS tenant_usage;
DROP TABLE IF EXISTS tenant_lifecycle;
DROP TABLE IF EXISTS tenant_health;
DROP TABLE IF EXISTS tenant_settings;
DROP TABLE IF EXISTS tenant_limits;
`;
