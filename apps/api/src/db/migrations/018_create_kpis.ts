import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
CREATE TABLE IF NOT EXISTS kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metric_name VARCHAR(200) NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  period VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'not_set',
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON kpis
  USING (organization_id::text = current_setting('app.current_tenant', true));

CREATE INDEX idx_kpis_org ON kpis (organization_id);
  `);
}

export async function down(_pool: Pool): Promise<void> {
  // no-op: destructive rollback not implemented for this migration
}
