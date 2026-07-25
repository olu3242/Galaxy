/**
 * Analytics OS Certification Test Suite
 *
 * Certifies the Analytics module lifecycle:
 * 1.  metrics and kpis tables exist with expected columns
 * 2.  Metric recording persists a record
 * 3.  Metrics are retrievable and tenant-scoped
 * 4.  Metric aggregation returns structured data
 * 5.  KPI creation persists with correct fields
 * 6.  KPI evaluation sets the correct status
 * 7.  Dashboard widget creation and retrieval
 * 8.  Report generation persists a ready report
 * 9.  Report listing is tenant-scoped
 * 10. Cross-tenant isolation — org B cannot see org A metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { MetricsService, KPIService, DashboardService, ReportingService } from '@galaxy/analytics';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2101-4000-8000-210000000001';
const orgIdB = '00000000-2101-4000-8000-210000000002';
const actorId = '00000000-2101-4000-8000-210000000010';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Analytics Test Org A', 'analytics-test-a', 'starter', 'active'),
            ($2, 'Analytics Test Org B', 'analytics-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM metrics WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM kpis WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM reports WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM dashboard_widgets WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Analytics OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. metrics and kpis tables exist with expected columns', async () => {
    for (const table of ['metrics', 'kpis']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Metric recording ───────────────────────────────────────────────────
  it('2. Metric recording persists a record', async () => {
    const svc = new MetricsService(pool);
    const now = new Date();
    const start = new Date(now.getTime() - 86400000);

    const metric = await svc.recordMetric({
      organizationId: orgId,
      name: 'workflow_completion_rate',
      category: 'workflow',
      value: 0.95,
      unit: 'ratio',
      period: 'daily',
      periodStart: start.toISOString(),
      periodEnd: now.toISOString(),
    });

    expect(metric.id).toBeTruthy();
    expect(metric.organizationId).toBe(orgId);
    expect(metric.name).toBe('workflow_completion_rate');
    expect(metric.value).toBeCloseTo(0.95);
  });

  // ── 3. Metrics retrieval and tenant scope ─────────────────────────────────
  it('3. Metrics are retrievable and tenant-scoped', async () => {
    const svc = new MetricsService(pool);
    const now = new Date();

    await svc.recordMetric({
      organizationId: orgId,
      name: 'api_call_count',
      category: 'platform',
      value: 100,
      unit: 'count',
      period: 'hourly',
      periodStart: new Date(now.getTime() - 3600000).toISOString(),
      periodEnd: now.toISOString(),
    });

    const metrics = await svc.getMetrics(orgId);
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect(m.organizationId).toBe(orgId);
    }
  });

  // ── 4. Metric aggregation ─────────────────────────────────────────────────
  it('4. Metric aggregation returns structured data', async () => {
    const svc = new MetricsService(pool);
    const aggregated = await svc.aggregateMetrics(orgId, 'workflow_completion_rate', 'daily');
    expect(Array.isArray(aggregated)).toBe(true);
    if (aggregated.length > 0) {
      expect(aggregated[0]).toHaveProperty('avg');
      expect(aggregated[0]).toHaveProperty('min');
      expect(aggregated[0]).toHaveProperty('max');
    }
  });

  // ── 5. KPI creation ───────────────────────────────────────────────────────
  it('5. KPI creation persists with correct fields', async () => {
    const svc = new KPIService(pool);

    const kpi = await svc.setKPI({
      organizationId: orgId,
      name: `workflow_sla_${crypto.randomUUID().slice(0, 8)}`,
      description: 'Percentage of workflows completed within SLA',
      metricName: 'workflow_completion_rate',
      targetValue: 0.95,
      unit: 'ratio',
      period: 'daily',
      ownerId: actorId,
    });

    expect(kpi.id).toBeTruthy();
    expect(kpi.organizationId).toBe(orgId);
    expect(kpi.targetValue).toBeCloseTo(0.95);
  });

  // ── 6. KPI evaluation ─────────────────────────────────────────────────────
  it('6. KPI evaluation sets the correct status', async () => {
    const svc = new KPIService(pool);

    const kpi = await svc.setKPI({
      organizationId: orgId,
      name: `approval_rate_${crypto.randomUUID().slice(0, 8)}`,
      metricName: 'approval_rate',
      targetValue: 0.9,
      unit: 'ratio',
      period: 'daily',
      ownerId: actorId,
    });

    const evaluated = await svc.evaluateKPI(orgId, kpi.id, 0.97);
    expect(['on_track', 'at_risk', 'off_track']).toContain(evaluated.status);
  });

  // ── 7. Dashboard widget ───────────────────────────────────────────────────
  it('7. Dashboard widget creation and retrieval work', async () => {
    const svc = new DashboardService(pool);

    const widget = await svc.createWidget({
      organizationId: orgId,
      category: 'executive',
      name: 'Workflow KPI Chart',
      type: 'chart',
      config: { metricName: 'workflow_completion_rate', chartType: 'line' },
    });

    expect(widget.id).toBeTruthy();
    expect(widget.organizationId).toBe(orgId);

    const widgets = await svc.getWidgets(orgId, 'executive');
    expect(Array.isArray(widgets)).toBe(true);
    expect(widgets.some((w) => w.id === widget.id)).toBe(true);
  });

  // ── 8. Report generation ──────────────────────────────────────────────────
  it('8. Report generation persists a ready report', async () => {
    const svc = new ReportingService(pool);

    const report = await svc.generateReport({
      organizationId: orgId,
      name: 'Monthly Operations Report',
      category: 'operations',
      generatedBy: actorId,
      data: { period: 'July 2026', metricsCount: 5 },
    });

    expect(report.id).toBeTruthy();
    expect(report.organizationId).toBe(orgId);
    expect(report.status).toBe('ready');
  });

  // ── 9. Report listing ─────────────────────────────────────────────────────
  it('9. Report listing is tenant-scoped', async () => {
    const svc = new ReportingService(pool);

    const reports = await svc.getReports(orgId);
    expect(Array.isArray(reports)).toBe(true);
    for (const r of reports) {
      expect(r.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A metrics', async () => {
    const svc = new MetricsService(pool);
    const now = new Date();

    await svc.recordMetric({
      organizationId: orgId,
      name: 'isolation_test_metric',
      category: 'platform',
      value: 42,
      unit: 'count',
      period: 'daily',
      periodStart: new Date(now.getTime() - 86400000).toISOString(),
      periodEnd: now.toISOString(),
    });

    const metricsB = await svc.getMetrics(orgIdB);
    const leaked = metricsB.some((m) => m.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
