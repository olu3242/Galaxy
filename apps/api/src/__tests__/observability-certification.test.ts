/**
 * Observability OS Certification Test Suite
 *
 * Certifies the Observability module lifecycle:
 * 1.  operational_metrics and alert_rules tables exist
 * 2.  Metric recording persists a data point
 * 3.  Metric query returns recorded points
 * 4.  Latest metric value retrieval works
 * 5.  Alert rule creation persists a record
 * 6.  Alert rule listing is tenant-scoped
 * 7.  Alert firing creates an active alert
 * 8.  Alert resolution sets state to resolved
 * 9.  Platform health check returns status
 * 10. Cross-tenant isolation — org B cannot see org A metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  MetricsCollectorService,
  AlertService,
  PlatformHealthService,
} from '@galaxy/observability';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3501-4000-8000-350000000001';
const orgIdB = '00000000-3501-4000-8000-350000000002';

let sharedRuleId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Observability Test Org A', 'obs-test-a', 'starter', 'active'),
            ($2, 'Observability Test Org B', 'obs-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new AlertService(pool);
  const rule = await svc.createRule({
    organizationId: orgId,
    name: 'Shared Cert Rule',
    metricName: 'workflow.error_rate',
    threshold: 0.05,
    operator: 'gt',
    severity: 'warning',
  });
  sharedRuleId = rule.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM alerts WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM alert_rules WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM operational_metrics WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM platform_health WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Observability OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. operational_metrics and alert_rules tables exist', async () => {
    for (const table of ['operational_metrics', 'alert_rules']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Metric recording ───────────────────────────────────────────────────
  it('2. Metric recording persists a data point', async () => {
    const svc = new MetricsCollectorService(pool);

    const point = await svc.record({
      organizationId: orgId,
      metricName: 'workflow.completion_rate',
      metricValue: 0.97,
      labels: { env: 'production', region: 'us-west-2' },
    });

    expect(point.id).toBeTruthy();
    expect(point.organizationId).toBe(orgId);
    expect(point.metricName).toBe('workflow.completion_rate');
    expect(point.metricValue).toBe(0.97);
  });

  // ── 3. Metric query ───────────────────────────────────────────────────────
  it('3. Metric query returns recorded points', async () => {
    const svc = new MetricsCollectorService(pool);

    const now = new Date();
    const from = new Date(now.getTime() - 60_000).toISOString();
    const to = new Date(now.getTime() + 60_000).toISOString();

    const points = await svc.query(orgId, {
      metricName: 'workflow.completion_rate',
      from,
      to,
    });

    expect(Array.isArray(points)).toBe(true);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.metricName).toBe('workflow.completion_rate');
    }
  });

  // ── 4. Latest metric value ────────────────────────────────────────────────
  it('4. Latest metric value retrieval works', async () => {
    const svc = new MetricsCollectorService(pool);

    const latest = await svc.getLatestValue(orgId, 'workflow.completion_rate');
    expect(latest).not.toBeNull();
    expect(latest?.metricValue).toBe(0.97);
  });

  // ── 5. Alert rule creation ────────────────────────────────────────────────
  it('5. Alert rule creation persists a record', async () => {
    const svc = new AlertService(pool);

    const rule = await svc.createRule({
      organizationId: orgId,
      name: 'High Error Rate',
      metricName: 'api.error_rate',
      threshold: 0.1,
      operator: 'gt',
      severity: 'critical',
    });

    expect(rule.id).toBeTruthy();
    expect(rule.organizationId).toBe(orgId);
    expect(rule.name).toBe('High Error Rate');
    expect(rule.severity).toBe('critical');
  });

  // ── 6. Alert rule listing ─────────────────────────────────────────────────
  it('6. Alert rule listing is tenant-scoped', async () => {
    const svc = new AlertService(pool);

    const rules = await svc.listRules(orgId);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.organizationId).toBe(orgId);
    }
  });

  // ── 7. Alert firing ───────────────────────────────────────────────────────
  it('7. Alert firing creates an active alert', async () => {
    const svc = new AlertService(pool);

    const alert = await svc.fireAlert(
      orgId,
      sharedRuleId,
      'Workflow error rate exceeded',
      'Workflow error rate exceeded threshold',
      { currentValue: 0.08 },
    );

    expect(alert.id).toBeTruthy();
    expect(alert.organizationId).toBe(orgId);
    expect(alert.alertRuleId).toBe(sharedRuleId);
    expect(alert.state).toBe('firing');
  });

  // ── 8. Alert resolution ───────────────────────────────────────────────────
  it('8. Alert resolution sets state to resolved', async () => {
    const svc = new AlertService(pool);

    const fired = await svc.fireAlert(
      orgId,
      sharedRuleId,
      'Error spike detected',
      'Error spike detected above threshold',
      {},
    );
    const resolved = await svc.resolveAlert(orgId, fired.id);
    expect(resolved).not.toBeNull();
    expect(resolved?.state).toBe('resolved');
    expect(resolved?.resolvedAt).toBeTruthy();
  });

  // ── 9. Platform health check ──────────────────────────────────────────────
  it('9. Platform health check returns status', async () => {
    const svc = new PlatformHealthService(pool);

    const health = await svc.checkWorkflowHealth(orgId);
    expect(health).toBeTruthy();
    expect(['healthy', 'degraded', 'critical']).toContain(health.status);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A metrics', async () => {
    const svc = new MetricsCollectorService(pool);

    const now = new Date();
    const from = new Date(now.getTime() - 86_400_000).toISOString();
    const to = new Date(now.getTime() + 60_000).toISOString();

    const pointsB = await svc.query(orgIdB, {
      metricName: 'workflow.completion_rate',
      from,
      to,
    });
    const leaked = pointsB.some((p) => p.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
