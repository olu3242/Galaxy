import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      check_out_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'whatsapp',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS attendance_records_org_idx ON attendance_records (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS attendance_records_user_idx ON attendance_records (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS attendance_records_check_in_idx ON attendance_records (check_in_at DESC)
  `);

  // RLS
  await pool.query(`ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    CREATE POLICY attendance_records_tenant_isolation ON attendance_records
    USING (organization_id::text = current_setting('app.current_tenant', true))
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS attendance_records');
}
