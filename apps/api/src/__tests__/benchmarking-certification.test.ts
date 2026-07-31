/**
 * Benchmarking OS Certification Test Suite
 *
 * Certifies the Benchmarking module lifecycle:
 * 1.  intelligence_contributions and intelligence_benchmarks tables exist
 * 2.  getOrgPercentile returns percentile data for an org
 * 3.  Percentile value is within 0–100
 * 4.  getIndustryReport returns a BenchmarkReport
 * 5.  BenchmarkReport has a metrics array
 * 6.  generateComparisonReport returns a ComparisonReport
 * 7.  ComparisonReport has a summary with overallPercentile
 * 8.  generateComparisonReport includes org percentiles
 * 9.  getOrgPercentile scopes to the requesting org
 * 10. Org B has no percentile data for org A's contributions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { IndustryBenchmarkService, PeerComparisonService } from '@galaxy/benchmarking';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4801-4000-8000-480000000001';
const orgIdB = '00000000-4801-4000-8000-480000000002';
const industry = 'fintech';
const sizeBucket = 'small';
const period = '2026-07';
const metricKey = 'cert-revenue-per-employee-48';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Benchmark Test Org A', 'benchmark-test-a', 'starter', 'active'),
            ($2, 'Benchmark Test Org B', 'benchmark-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  await pool.query(`SELECT set_config('app.current_tenant', $1, true)`, [orgId]);
  await pool.query(
    `INSERT INTO intelligence_contributions (organization_id, metric_key, metric_value, period)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, metric_key, period) DO NOTHING`,
    [orgId, metricKey, 145000.0, period],
  );

  await pool.query(
    `INSERT INTO intelligence_benchmarks (industry, size_bucket, metric_key, p25, p50, p75, p90, cohort_size, period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (industry, size_bucket, metric_key, period) DO NOTHING`,
    [industry, sizeBucket, metricKey, 80000.0, 110000.0, 140000.0, 175000.0, 20, period],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM intelligence_contributions WHERE organization_id IN ($1, $2)`, [
      orgId,
      orgIdB,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM intelligence_benchmarks WHERE metric_key = $1`, [metricKey])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Benchmarking OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. intelligence_contributions and intelligence_benchmarks tables exist', async () => {
    for (const table of ['intelligence_contributions', 'intelligence_benchmarks']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. getOrgPercentile returns percentile data ───────────────────────────
  it('2. getOrgPercentile returns percentile data for an org', async () => {
    const svc = new IndustryBenchmarkService(pool);

    const percentiles = await svc.getOrgPercentile(orgId, industry, sizeBucket, period);
    expect(Array.isArray(percentiles)).toBe(true);
    expect(percentiles.length).toBeGreaterThan(0);
  });

  // ── 3. Percentile value is within 0–100 ───────────────────────────────────
  it('3. Percentile value is within 0–100', async () => {
    const svc = new IndustryBenchmarkService(pool);

    const percentiles = await svc.getOrgPercentile(orgId, industry, sizeBucket, period);
    for (const p of percentiles) {
      expect(p.percentile).toBeGreaterThanOrEqual(0);
      expect(p.percentile).toBeLessThanOrEqual(100);
    }
  });

  // ── 4. getIndustryReport returns a BenchmarkReport ───────────────────────
  it('4. getIndustryReport returns a BenchmarkReport', async () => {
    const svc = new IndustryBenchmarkService(pool);

    const report = await svc.getIndustryReport(industry, sizeBucket, period);
    expect(report).toBeTruthy();
    expect(report.industry).toBe(industry);
    expect(report.sizeBucket).toBe(sizeBucket);
  });

  // ── 5. BenchmarkReport has a metrics array ────────────────────────────────
  it('5. BenchmarkReport has a metrics array', async () => {
    const svc = new IndustryBenchmarkService(pool);

    const report = await svc.getIndustryReport(industry, sizeBucket, period);
    expect(Array.isArray(report.metrics)).toBe(true);
    expect(report.metrics.length).toBeGreaterThan(0);
    const m = report.metrics[0];
    if (m) {
      expect(typeof m.p50).toBe('number');
      expect(typeof m.cohortSize).toBe('number');
    }
  });

  // ── 6. generateComparisonReport returns a ComparisonReport ────────────────
  it('6. generateComparisonReport returns a ComparisonReport', async () => {
    const svc = new PeerComparisonService(pool);

    const report = await svc.generateComparisonReport(orgId, industry, sizeBucket, period);
    expect(report).toBeTruthy();
    expect(report.organizationId).toBe(orgId);
  });

  // ── 7. ComparisonReport has a summary with overallPercentile ──────────────
  it('7. ComparisonReport has a summary with overallPercentile', async () => {
    const svc = new PeerComparisonService(pool);

    const report = await svc.generateComparisonReport(orgId, industry, sizeBucket, period);
    expect(typeof report.summary.overallPercentile).toBe('number');
    expect(report.summary.overallPercentile).toBeGreaterThanOrEqual(0);
    expect(report.summary.overallPercentile).toBeLessThanOrEqual(100);
  });

  // ── 8. generateComparisonReport includes org percentiles ─────────────────
  it('8. generateComparisonReport includes org percentiles', async () => {
    const svc = new PeerComparisonService(pool);

    const report = await svc.generateComparisonReport(orgId, industry, sizeBucket, period);
    expect(Array.isArray(report.percentiles)).toBe(true);
    expect(report.percentiles.length).toBeGreaterThan(0);
    expect(report.percentiles[0]?.organizationId).toBe(orgId);
  });

  // ── 9. getOrgPercentile scopes to the requesting org ─────────────────────
  it('9. getOrgPercentile scopes to the requesting org', async () => {
    const svc = new IndustryBenchmarkService(pool);

    const percentiles = await svc.getOrgPercentile(orgId, industry, sizeBucket, period);
    for (const p of percentiles) {
      expect(p.organizationId).toBe(orgId);
    }
  });

  // ── 10. Org B has no percentile data for org A's contributions ────────────
  it('10. Org B has no percentile data for org A contributions', async () => {
    const svc = new IndustryBenchmarkService(pool);

    const percentilesB = await svc.getOrgPercentile(orgIdB, industry, sizeBucket, period);
    const leaked = percentilesB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
