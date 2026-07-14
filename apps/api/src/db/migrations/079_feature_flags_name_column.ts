import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // Migration 043 created feature_flags with `key` column.
  // Migration 066 attempted a separate CREATE TABLE with `name` column but was a no-op.
  // The platform FeatureFlagService queries `ORDER BY name`, so we add the column here.
  await pool.query(`
    ALTER TABLE feature_flags
    ADD COLUMN IF NOT EXISTS name TEXT GENERATED ALWAYS AS (key) STORED
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE feature_flags DROP COLUMN IF EXISTS name`);
}
