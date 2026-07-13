import { Pool } from 'pg';
import { hashPassword } from '@galaxy/identity';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert test organization
    const orgResult = await client.query<{ id: string }>(
      `INSERT INTO organizations (id, name, slug, tier, status)
       VALUES (
         '00000000-0000-0000-0000-000000000001',
         'Galaxy Test Org',
         'galaxy-test',
         'enterprise',
         'active'
       )
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) throw new Error('Failed to upsert organization');
    console.warn('[seed] Organization:', orgId);

    // Upsert admin role
    const roleResult = await client.query<{ id: string }>(
      `INSERT INTO roles (id, organization_id, name, slug, scope, is_system)
       VALUES (
         '00000000-0000-0000-0000-000000000010',
         $1,
         'Admin',
         'admin',
         'organization',
         true
       )
       ON CONFLICT (organization_id, slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [orgId],
    );
    const roleId = roleResult.rows[0]?.id;
    if (!roleId) throw new Error('Failed to upsert role');
    console.warn('[seed] Role:', roleId);

    // Upsert test admin user
    const passwordHash = await hashPassword('galaxy-test-password');
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (id, organization_id, email, password_hash, display_name, status)
       VALUES (
         '00000000-0000-0000-0000-000000000100',
         $1,
         'admin@galaxy-test.local',
         $2,
         'Test Admin',
         'active'
       )
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             display_name  = EXCLUDED.display_name
       RETURNING id`,
      [orgId, passwordHash],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) throw new Error('Failed to upsert user');
    console.warn('[seed] User:', userId);

    // Upsert membership — role text column populated by migration 076
    await client.query(
      `INSERT INTO memberships (organization_id, user_id, role_id, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET role_id = EXCLUDED.role_id,
             role    = EXCLUDED.role,
             status  = EXCLUDED.status`,
      [orgId, userId, roleId],
    );
    console.warn('[seed] Membership created');

    await client.query('COMMIT');
    console.warn('[seed] Done');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err: unknown) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
