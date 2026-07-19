export const up = `
CREATE TABLE IF NOT EXISTS feature_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_tier VARCHAR(64) NOT NULL,
  feature_key VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (plan_tier, feature_key)
);

CREATE TABLE IF NOT EXISTS org_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  feature_key VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_feature_entitlements_plan ON feature_entitlements (plan_tier);
CREATE INDEX IF NOT EXISTS idx_org_overrides_org ON org_feature_overrides (organization_id);
`;

export const down = `
DROP TABLE IF EXISTS org_feature_overrides;
DROP TABLE IF EXISTS feature_entitlements;
`;
