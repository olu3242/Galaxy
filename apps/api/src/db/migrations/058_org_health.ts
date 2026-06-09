import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_health_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      dimension TEXT NOT NULL,
      score FLOAT NOT NULL,
      status TEXT NOT NULL,
      indicators JSONB NOT NULL DEFAULT '{}',
      recommendations JSONB NOT NULL DEFAULT '[]',
      measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE org_health_scores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON org_health_scores
      USING (organization_id::text = current_setting('app.current_tenant', true));
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS org_health_scores;');
}
