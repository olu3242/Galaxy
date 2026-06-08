import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_consumers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      consumer_name TEXT NOT NULL,
      consumer_group TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_heartbeat_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, consumer_name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      consumer_id UUID NOT NULL REFERENCES event_consumers(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      filter_conditions JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_retries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event_id UUID NOT NULL,
      consumer_id UUID NOT NULL REFERENCES event_consumers(id),
      attempt_number INT NOT NULL DEFAULT 1,
      last_error TEXT,
      next_retry_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','retrying','succeeded','exhausted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_dead_letters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event_id UUID NOT NULL,
      consumer_id UUID NOT NULL REFERENCES event_consumers(id),
      event_type TEXT NOT NULL,
      event_payload JSONB NOT NULL DEFAULT '{}',
      failure_reason TEXT NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS event_subscriptions_consumer_type_idx
      ON event_subscriptions (consumer_id, event_type)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS event_retries_org_status_retry_idx
      ON event_retries (organization_id, status, next_retry_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS event_dead_letters_org_type_idx
      ON event_dead_letters (organization_id, event_type)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`DROP INDEX IF EXISTS event_dead_letters_org_type_idx`);
  await pool.query(`DROP INDEX IF EXISTS event_retries_org_status_retry_idx`);
  await pool.query(`DROP INDEX IF EXISTS event_subscriptions_consumer_type_idx`);

  await pool.query(`DROP TABLE IF EXISTS event_dead_letters`);
  await pool.query(`DROP TABLE IF EXISTS event_retries`);
  await pool.query(`DROP TABLE IF EXISTS event_subscriptions`);
  await pool.query(`DROP TABLE IF EXISTS event_consumers`);
}
