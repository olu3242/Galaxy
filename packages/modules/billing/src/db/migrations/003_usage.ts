export const up = `
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  subscription_id UUID,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  total_quantity BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, subscription_id, period_start, event_type)
);

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE,
  max_workflow_runs INTEGER NOT NULL DEFAULT 10000,
  max_agent_executions INTEGER NOT NULL DEFAULT 1000,
  max_api_calls INTEGER NOT NULL DEFAULT 100000,
  max_storage_mb INTEGER NOT NULL DEFAULT 1024,
  max_member_seats INTEGER NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  threshold INTEGER NOT NULL,
  current_value INTEGER NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, event_type, threshold)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_type ON usage_events (organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_period ON usage_events (organization_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_org_period ON usage_records (organization_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_org ON usage_alerts (organization_id);
`;

export const down = `
DROP TABLE IF EXISTS usage_alerts;
DROP TABLE IF EXISTS usage_limits;
DROP TABLE IF EXISTS usage_snapshots;
DROP TABLE IF EXISTS usage_records;
`;
