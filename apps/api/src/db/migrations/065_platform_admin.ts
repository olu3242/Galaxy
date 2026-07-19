import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Platform admin actions (global, no org RLS)
    CREATE TABLE IF NOT EXISTS platform_admin_actions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id      TEXT NOT NULL,
      action_type   TEXT NOT NULL,
      payload       JSONB NOT NULL DEFAULT '{}',
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Platform admin metrics (global)
    CREATE TABLE IF NOT EXISTS platform_admin_metrics (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      metric_name   TEXT NOT NULL,
      value         NUMERIC NOT NULL,
      labels        JSONB NOT NULL DEFAULT '{}',
      recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_platform_admin_metrics_name ON platform_admin_metrics (metric_name, recorded_at DESC);

    -- Support tickets (org-scoped)
    CREATE TABLE IF NOT EXISTS support_tickets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      subject         TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'open',
      priority        TEXT NOT NULL DEFAULT 'medium',
      assigned_to     TEXT,
      resolved_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS support_tickets_tenant ON support_tickets;
    CREATE POLICY support_tickets_tenant ON support_tickets
      USING (organization_id::text = current_setting('app.current_tenant', true));
    CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets (organization_id, created_at DESC);

    -- Admin notes (org-scoped)
    CREATE TABLE IF NOT EXISTS admin_notes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      author_id       TEXT NOT NULL,
      content         TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS admin_notes_tenant ON admin_notes;
    CREATE POLICY admin_notes_tenant ON admin_notes
      USING (organization_id::text = current_setting('app.current_tenant', true));

    -- Tenants table
    CREATE TABLE IF NOT EXISTS tenants (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'trial',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

    -- Tenant settings
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      PRIMARY KEY (tenant_id, key)
    );

    -- Tenant health
    CREATE TABLE IF NOT EXISTS tenant_health (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      score       NUMERIC NOT NULL,
      metrics     JSONB NOT NULL DEFAULT '{}',
      checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_health_tid ON tenant_health (tenant_id, checked_at DESC);

    -- Tenant limits
    CREATE TABLE IF NOT EXISTS tenant_limits (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      resource_type   TEXT NOT NULL,
      limit_value     NUMERIC NOT NULL,
      current_value   NUMERIC NOT NULL DEFAULT 0,
      UNIQUE (tenant_id, resource_type)
    );
  `);
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS tenant_limits;
    DROP TABLE IF EXISTS tenant_health;
    DROP TABLE IF EXISTS tenant_settings;
    DROP TABLE IF EXISTS tenants;
    DROP TABLE IF EXISTS admin_notes;
    DROP TABLE IF EXISTS support_tickets;
    DROP TABLE IF EXISTS platform_admin_metrics;
    DROP TABLE IF EXISTS platform_admin_actions;
  `);
}
