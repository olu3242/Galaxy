import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID        NOT NULL,
      name            TEXT        NOT NULL,
      category        TEXT        NOT NULL DEFAULT 'UTILITY'
        CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
      language        TEXT        NOT NULL DEFAULT 'en',
      status          TEXT        NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED')),
      header          TEXT,
      body            TEXT        NOT NULL,
      footer          TEXT,
      buttons         JSONB       NOT NULL DEFAULT '[]',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE wa_templates ENABLE ROW LEVEL SECURITY`);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'wa_templates' AND policyname = 'wa_templates_tenant_isolation'
      ) THEN
        CREATE POLICY wa_templates_tenant_isolation ON wa_templates
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END $$
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_wa_templates_org ON wa_templates (organization_id)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS wa_templates`);
}
