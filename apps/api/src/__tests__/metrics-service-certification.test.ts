/**
 * Metrics Service Certification Test Suite — Phase 90
 *
 * Certifies MetricsService from @galaxy/platform:
 * 1.  record creates a platform metric
 * 2.  metric has correct metricName and value
 * 3.  metric stores labels correctly
 * 4.  query returns an array
 * 5.  query filters by metricName
 * 6.  query respects limit
 * 7.  query filters by since date
 * 8.  multiple metrics — query returns all for name
 * 9.  metric value is numeric after retrieval
 * 10. Cross-name: query returns correct metrics per metricName
 */

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { MetricsService, type PlatformMetric } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool
    .query(`DELETE FROM platform_metrics WHERE metric_name LIKE 'cert90.%'`)
    .catch(() => null);
  await pool.end();
});

describe('Metrics Service Certification', () => {
  // ── 1. record creates a platform metric ───────────────────────────────────
  it('1. record creates a platform metric', async () => {
    const svc = new MetricsService(pool);
    const metric: PlatformMetric = await svc.record({
      metricName: 'cert90.api_latency_ms',
      value: 120,
    });
    expect(metric).toBeTruthy();
    expect(metric.id).toBeTruthy();
  });

  // ── 2. metric has correct metricName and value ────────────────────────────
  it('2. metric has correct metricName and value', async () => {
    const svc = new MetricsService(pool);
    const metric: PlatformMetric = await svc.record({
      metricName: 'cert90.request_count',
      value: 42,
    });
    expect(metric.metricName).toBe('cert90.request_count');
    expect(metric.value).toBe(42);
  });

  // ── 3. metric stores labels correctly ─────────────────────────────────────
  it('3. metric stores labels correctly', async () => {
    const svc = new MetricsService(pool);
    const metric: PlatformMetric = await svc.record({
      metricName: 'cert90.api_latency_ms',
      value: 200,
      labels: { route: '/api/v1/orgs', method: 'GET' },
    });
    expect(metric.labels).toMatchObject({ route: '/api/v1/orgs', method: 'GET' });
  });

  // ── 4. query returns an array ─────────────────────────────────────────────
  it('4. query returns an array', async () => {
    const svc = new MetricsService(pool);
    const metrics: PlatformMetric[] = await svc.query({
      metricName: 'cert90.api_latency_ms',
    });
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
  });

  // ── 5. query filters by metricName ────────────────────────────────────────
  it('5. query filters by metricName', async () => {
    const svc = new MetricsService(pool);
    const metrics: PlatformMetric[] = await svc.query({
      metricName: 'cert90.api_latency_ms',
    });
    expect(metrics.every((m) => m.metricName === 'cert90.api_latency_ms')).toBe(true);
  });

  // ── 6. query respects limit ───────────────────────────────────────────────
  it('6. query respects limit', async () => {
    const svc = new MetricsService(pool);
    const metrics: PlatformMetric[] = await svc.query({
      metricName: 'cert90.api_latency_ms',
      limit: 1,
    });
    expect(metrics.length).toBeLessThanOrEqual(1);
  });

  // ── 7. query filters by since date ────────────────────────────────────────
  it('7. query filters by since date', async () => {
    const svc = new MetricsService(pool);
    const future = new Date(Date.now() + 60_000);
    const metrics: PlatformMetric[] = await svc.query({
      metricName: 'cert90.api_latency_ms',
      since: future,
    });
    expect(metrics.length).toBe(0);
  });

  // ── 8. multiple metrics — query returns all for name ─────────────────────
  it('8. query returns all metrics for the given name', async () => {
    const svc = new MetricsService(pool);
    await svc.record({ metricName: 'cert90.api_latency_ms', value: 300 });
    await svc.record({ metricName: 'cert90.api_latency_ms', value: 400 });
    const metrics: PlatformMetric[] = await svc.query({
      metricName: 'cert90.api_latency_ms',
    });
    expect(metrics.length).toBeGreaterThanOrEqual(3);
  });

  // ── 9. metric value is numeric after retrieval ────────────────────────────
  it('9. metric value is numeric after retrieval', async () => {
    const svc = new MetricsService(pool);
    const metrics: PlatformMetric[] = await svc.query({
      metricName: 'cert90.request_count',
      limit: 1,
    });
    const metric = metrics[0];
    expect(metric).toBeTruthy();
    expect(typeof metric?.value).toBe('number');
  });

  // ── 10. Cross-name: query returns correct metrics per metricName ──────────
  it('10. query returns correct metrics per metricName', async () => {
    const svc = new MetricsService(pool);
    const latency: PlatformMetric[] = await svc.query({
      metricName: 'cert90.api_latency_ms',
    });
    const count: PlatformMetric[] = await svc.query({
      metricName: 'cert90.request_count',
    });
    expect(latency.every((m) => m.metricName === 'cert90.api_latency_ms')).toBe(true);
    expect(count.every((m) => m.metricName === 'cert90.request_count')).toBe(true);
    expect(latency.length).toBeGreaterThan(0);
    expect(count.length).toBeGreaterThan(0);
  });
});
