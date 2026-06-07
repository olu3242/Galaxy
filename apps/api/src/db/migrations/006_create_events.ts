import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      correlation_id UUID NOT NULL,
      causation_id UUID NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'system')),
      actor_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS events_org_idx ON events (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS events_type_idx ON events (type)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS events_correlation_idx ON events (correlation_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at DESC)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS events');
}
