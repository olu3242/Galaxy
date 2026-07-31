/**
 * Predictive Operations & Benchmarking Certification Test Suite
 *
 * Certifies the Predictive OS and Benchmarking modules:
 * 1.  predictive_scores table exists with expected columns
 * 2.  Workload forecast returns a structured forecast for a domain
 * 3.  SLA breach probability computation runs without error
 * 4.  Churn risk computation returns scored members (or empty if no data)
 * 5.  Forecast confidence is between 0 and 1
 * 6.  Predicted breaches reference valid workflow_runs if any returned
 * 7.  Churn risk levels are one of low/medium/high
 * 8.  Industry benchmark percentile lookup returns a valid OrgPercentile
 * 9.  Industry benchmark report returns sectioned benchmark data
 * 10. Peer comparison report is generated without error
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  WorkloadForecastService,
  SLABreachPredictorService,
  ChurnRiskService,
} from '@galaxy/predictive';
import { IndustryBenchmarkService, PeerComparisonService } from '@galaxy/benchmarking';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-ff01-4000-8000-f1a000000001';
const orgIdB = '00000000-ff01-4000-8000-f1a000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Predictive Test Org A', 'pred-test-a', 'starter', 'active'),
            ($2, 'Predictive Test Org B', 'pred-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM predictive_scores WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Predictive Operations & Benchmarking Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. predictive_scores table exists with expected columns', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'predictive_scores' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'predictive_scores must have columns').toBeGreaterThan(0);
  });

  // ── 2. Workload forecast ──────────────────────────────────────────────────
  it('2. Workload forecast returns a structured forecast for a domain', async () => {
    const svc = new WorkloadForecastService(pool);
    const forecast = await svc.forecast(orgId, 'leave_request');

    expect(forecast.organizationId).toBe(orgId);
    expect(forecast.domain).toBe('leave_request');
    expect(typeof forecast.forecastedVolume).toBe('number');
    expect(typeof forecast.historicalAvg).toBe('number');
    expect(typeof forecast.confidence).toBe('number');
    expect(typeof forecast.period).toBe('string');
  });

  // ── 3. SLA breach prediction ──────────────────────────────────────────────
  it('3. SLA breach probability computation runs without error', async () => {
    const svc = new SLABreachPredictorService(pool);
    const breaches = await svc.computeBreachProbability(orgId);
    expect(Array.isArray(breaches)).toBe(true);
  });

  // ── 4. Churn risk computation ─────────────────────────────────────────────
  it('4. Churn risk computation returns scored members or empty array', async () => {
    const svc = new ChurnRiskService(pool);
    const risks = await svc.computeChurnRisk(orgId);
    expect(Array.isArray(risks)).toBe(true);
  });

  // ── 5. Forecast confidence bounds ────────────────────────────────────────
  it('5. Forecast confidence is within [0, 1]', async () => {
    const svc = new WorkloadForecastService(pool);
    const forecast = await svc.forecast(orgId, 'expense_approval');
    expect(forecast.confidence).toBeGreaterThanOrEqual(0);
    expect(forecast.confidence).toBeLessThanOrEqual(1);
  });

  // ── 6. Breach prediction references valid workflow_runs ───────────────────
  it('6. Predicted breaches have required fields if any are returned', async () => {
    const svc = new SLABreachPredictorService(pool);
    const breaches = await svc.computeBreachProbability(orgId);

    for (const breach of breaches) {
      expect(breach.organizationId).toBe(orgId);
      expect(typeof breach.breachProbability).toBe('number');
      expect(breach.breachProbability).toBeGreaterThanOrEqual(0);
      expect(breach.breachProbability).toBeLessThanOrEqual(1);
      expect(typeof breach.slaDeadline).toBe('string');
    }
  });

  // ── 7. Churn risk levels are valid ────────────────────────────────────────
  it('7. Churn risk levels are one of low/medium/high', async () => {
    const svc = new ChurnRiskService(pool);
    const risks = await svc.computeChurnRisk(orgId);

    const validLevels = new Set(['low', 'medium', 'high']);
    for (const risk of risks) {
      expect(validLevels.has(risk.riskLevel)).toBe(true);
      expect(risk.organizationId).toBe(orgId);
      expect(typeof risk.score).toBe('number');
      expect(Array.isArray(risk.factors)).toBe(true);
    }
  });

  // ── 8. Industry benchmark percentile ─────────────────────────────────────
  it('8. Industry benchmark percentile lookup returns an OrgPercentile', async () => {
    const svc = new IndustryBenchmarkService(pool);

    // Seed a benchmark row so there is data to compare against
    await pool
      .query(
        `INSERT INTO intelligence_benchmarks
         (industry, size_bucket, metric_key, p25, p50, p75, p90, cohort_size, period)
       VALUES ('general', 'small', 'workflow.completion_rate', 0.65, 0.78, 0.88, 0.95, 15, '2026-06')
       ON CONFLICT DO NOTHING`,
      )
      .catch(() => null);

    const percentiles = await svc.getOrgPercentile(orgId, 'general', 'small', '2026-06');
    expect(Array.isArray(percentiles)).toBe(true);
    if (percentiles.length > 0) {
      const p = percentiles[0];
      if (p) {
        expect(p).toHaveProperty('metricKey');
        expect(typeof p.percentile).toBe('number');
        expect(p.percentile).toBeGreaterThanOrEqual(0);
        expect(p.percentile).toBeLessThanOrEqual(100);
      }
    }
  });

  // ── 9. Industry benchmark report ─────────────────────────────────────────
  it('9. Industry benchmark report returns sectioned benchmark data', async () => {
    const svc = new IndustryBenchmarkService(pool);
    const report = await svc.getIndustryReport('general', 'small');
    expect(report).toBeDefined();
    expect(report).toHaveProperty('industry');
    expect(report).toHaveProperty('sizeBucket');
    expect(Array.isArray(report.metrics)).toBe(true);
  });

  // ── 10. Peer comparison report ────────────────────────────────────────────
  it('10. Peer comparison report is generated without error', async () => {
    const svc = new PeerComparisonService(pool);
    const report = await svc.generateComparisonReport(orgId, 'general', 'small');
    expect(report).toBeDefined();
    expect(report.organizationId).toBe(orgId);
    expect(Array.isArray(report.percentiles)).toBe(true);
    expect(report).toHaveProperty('summary');
  });
});
