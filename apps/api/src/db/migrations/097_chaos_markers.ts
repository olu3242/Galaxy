import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chaos_markers (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      scenario        TEXT        NOT NULL,
      marker_value    TEXT        NOT NULL,
      injected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, scenario)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_chaos_markers_org ON chaos_markers(organization_id)`,
  );
  await pool.query(`ALTER TABLE chaos_markers ENABLE ROW LEVEL SECURITY`);
  await pool.query(`
    CREATE POLICY chaos_markers_tenant_isolation ON chaos_markers
      USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS chaos_markers`);
}
