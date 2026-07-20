import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_memory_entries (
      id              UUID        NOT NULL DEFAULT gen_random_uuid(),
      organization_id UUID        NOT NULL,
      category        TEXT        NOT NULL,
      title           TEXT        NOT NULL,
      content         TEXT        NOT NULL,
      tags            TEXT[]      NOT NULL DEFAULT '{}',
      confidence      NUMERIC     NOT NULL DEFAULT 0.5,
      source_type     TEXT        NOT NULL,
      source_id       TEXT        NOT NULL,
      correlation_id  TEXT        NOT NULL,
      created_by      TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ,
      version         INTEGER     NOT NULL DEFAULT 1,
      PRIMARY KEY (id, version)
    )
  `);

  await pool.query(`
    ALTER TABLE org_memory_entries ENABLE ROW LEVEL SECURITY
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'org_memory_entries'
          AND policyname = 'tenant_isolation'
      ) THEN
        CREATE POLICY tenant_isolation ON org_memory_entries
          USING (organization_id::text = current_setting('app.current_tenant', true));
      END IF;
    END;
    $$
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_org_memory_entries_org_category_created
      ON org_memory_entries (organization_id, category, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_org_memory_entries_org_source
      ON org_memory_entries (organization_id, source_type, source_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_org_memory_entries_tags
      ON org_memory_entries USING GIN (tags)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS org_memory_entries`);
}
