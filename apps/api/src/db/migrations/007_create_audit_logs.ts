import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id),
      actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'agent', 'system')),
      actor_id UUID,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id UUID,
      old_value JSONB,
      new_value JSONB,
      ip_address INET,
      correlation_id UUID NOT NULL,
      causation_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON audit_logs (organization_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_correlation_idx ON audit_logs (correlation_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_type, actor_id)
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS audit_logs');
}
