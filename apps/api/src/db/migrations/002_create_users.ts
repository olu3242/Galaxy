import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT UNIQUE,
      password_hash TEXT,
      whatsapp_phone TEXT,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
      last_active_at TIMESTAMPTZ,
      profile_data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_org_idx ON users (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_email_idx ON users (email) WHERE email IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_whatsapp_idx ON users (whatsapp_phone) WHERE whatsapp_phone IS NOT NULL
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS users');
}
