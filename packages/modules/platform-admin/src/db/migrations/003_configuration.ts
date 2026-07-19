export const up = `
CREATE TABLE IF NOT EXISTS org_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  scope VARCHAR(64) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, scope, key)
);

CREATE TABLE IF NOT EXISTS dept_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  department_id UUID NOT NULL,
  scope VARCHAR(64) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, department_id, scope, key)
);

CREATE INDEX IF NOT EXISTS idx_org_config_org_scope ON org_configurations (organization_id, scope);
CREATE INDEX IF NOT EXISTS idx_dept_config_org_dept ON dept_configurations (organization_id, department_id);
`;

export const down = `
DROP TABLE IF EXISTS dept_configurations;
DROP TABLE IF EXISTS org_configurations;
`;
