import type { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // Predictive scores
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictive_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      score_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      score NUMERIC(8,4) NOT NULL DEFAULT 0,
      factors JSONB NOT NULL DEFAULT '{}',
      predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);

  // Risk alerts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS risk_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      domain TEXT NOT NULL CHECK (
        domain IN ('operational','compliance','financial','security','reputational')
      ),
      severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      score NUMERIC(8,4) NOT NULL DEFAULT 0,
      is_resolved BOOLEAN NOT NULL DEFAULT false,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Intelligence contributions (opt-in anonymized data)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intelligence_contributions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      metric_key TEXT NOT NULL,
      metric_value NUMERIC(20,6) NOT NULL,
      period TEXT NOT NULL,
      anonymization_noise NUMERIC(20,6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, metric_key, period)
    )
  `);

  // Intelligence benchmarks — no RLS (cross-org read)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intelligence_benchmarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      industry TEXT NOT NULL,
      size_bucket TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      p25 NUMERIC(20,6) NOT NULL DEFAULT 0,
      p50 NUMERIC(20,6) NOT NULL DEFAULT 0,
      p75 NUMERIC(20,6) NOT NULL DEFAULT 0,
      p90 NUMERIC(20,6) NOT NULL DEFAULT 0,
      cohort_size INTEGER NOT NULL DEFAULT 0,
      period TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(industry, size_bucket, metric_key, period)
    )
  `);

  // RLS on tenant-scoped tables
  for (const table of ['predictive_scores', 'risk_alerts', 'intelligence_contributions']) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (organization_id::text = current_setting('app.current_tenant', true))
    `);
  }

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_predictive_scores_org ON predictive_scores(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_predictive_scores_type ON predictive_scores(organization_id, score_type)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_risk_alerts_org ON risk_alerts(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_risk_alerts_resolved ON risk_alerts(organization_id, is_resolved)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_intelligence_contributions_org ON intelligence_contributions(organization_id)',
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_intelligence_benchmarks_lookup ON intelligence_benchmarks(industry, size_bucket, period)',
  );
}

export async function down(pool: Pool): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS intelligence_benchmarks CASCADE');
  await pool.query('DROP TABLE IF EXISTS intelligence_contributions CASCADE');
  await pool.query('DROP TABLE IF EXISTS risk_alerts CASCADE');
  await pool.query('DROP TABLE IF EXISTS predictive_scores CASCADE');
}
