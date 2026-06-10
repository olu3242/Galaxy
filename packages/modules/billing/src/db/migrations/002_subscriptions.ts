export const up = `
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  previous_plan_id UUID,
  new_plan_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  trial_start TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ NOT NULL,
  is_converted BOOLEAN NOT NULL DEFAULT false,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_org ON subscription_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_sub ON subscription_events (subscription_id);
CREATE INDEX IF NOT EXISTS idx_trials_org ON trials (organization_id);
`;

export const down = `
DROP TABLE IF EXISTS trials;
DROP TABLE IF EXISTS subscription_events;
`;
