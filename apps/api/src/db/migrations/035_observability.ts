import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_health_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      component TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'critical')),
      details JSONB NOT NULL DEFAULT '{}',
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, component)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS operational_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      metric_name TEXT NOT NULL,
      metric_value NUMERIC NOT NULL,
      labels JSONB NOT NULL DEFAULT '{}',
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      threshold NUMERIC NOT NULL,
      operator TEXT NOT NULL CHECK (operator IN ('gt', 'lt', 'gte', 'lte', 'eq')),
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      state TEXT NOT NULL DEFAULT 'firing' CHECK (state IN ('firing', 'resolved')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}',
      fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
      severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      postmortem_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS slo_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      target_percentage NUMERIC(5, 2) NOT NULL,
      window_days INTEGER NOT NULL DEFAULT 30,
      current_compliance NUMERIC(5, 2) NOT NULL DEFAULT 100,
      is_breaching BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_metrics_org_name ON operational_metrics(organization_id, metric_name)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON operational_metrics(timestamp DESC)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_alerts_org_state ON alerts(organization_id, state)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_incidents_org_status ON incidents(organization_id, status)`,
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS slo_definitions CASCADE');
  await pool.query('DROP TABLE IF EXISTS incidents CASCADE');
  await pool.query('DROP TABLE IF EXISTS alerts CASCADE');
  await pool.query('DROP TABLE IF EXISTS alert_rules CASCADE');
  await pool.query('DROP TABLE IF EXISTS operational_metrics CASCADE');
  await pool.query('DROP TABLE IF EXISTS platform_health_checks CASCADE');
}
