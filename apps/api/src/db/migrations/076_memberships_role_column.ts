import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE memberships
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  `);

  await pool.query(`
    UPDATE memberships m
    SET role = r.slug
    FROM roles r
    WHERE m.role_id = r.id
      AND m.role = 'member'
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE memberships DROP COLUMN IF EXISTS role
  `);
}
