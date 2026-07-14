import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE loop_instances
    ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT NULL
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE loop_instances DROP COLUMN IF EXISTS phase`);
}
