/**
 * Risk Intelligence OS Certification Test Suite
 *
 * Certifies the Risk Intelligence module lifecycle:
 * 1.  risk_alerts table exists
 * 2.  Risk alert creation persists a record
 * 3.  Alert listing returns unresolved alerts
 * 4.  Alert listing includes resolved alerts when requested
 * 5.  Alert resolution sets is_resolved = true
 * 6.  Multiple alerts created in batch
 * 7.  Deduplication prevents duplicate unresolved alerts
 * 8.  Resolved alert excluded from default listing
 * 9.  Alert listing is tenant-scoped
 * 10. Cross-tenant isolation — org B cannot see org A alerts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { RiskAlertService } from '@galaxy/risk-intelligence';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3701-4000-8000-370000000001';
const orgIdB = '00000000-3701-4000-8000-370000000002';

let sharedAlertId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Risk Test Org A', 'risk-test-a', 'starter', 'active'),
            ($2, 'Risk Test Org B', 'risk-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new RiskAlertService(pool);
  const alerts = await svc.processRiskAlerts([
    {
      organizationId: orgId,
      domain: 'operational',
      severity: 'high',
      title: 'Shared Cert Alert',
      description: 'Cert alert for shared use',
      score: 65,
    },
  ]);
  const first = alerts[0];
  sharedAlertId = first?.id ?? '';
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM risk_alerts WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Risk Intelligence OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. risk_alerts table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'risk_alerts' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'risk_alerts must have columns').toBeGreaterThan(0);
  });

  // ── 2. Alert creation ─────────────────────────────────────────────────────
  it('2. Risk alert creation persists a record', async () => {
    const svc = new RiskAlertService(pool);

    const alerts = await svc.processRiskAlerts([
      {
        organizationId: orgId,
        domain: 'compliance',
        severity: 'critical',
        title: 'Compliance Violation Detected',
        description: 'High rejection rate in approvals',
        score: 80,
      },
    ]);

    expect(alerts.length).toBe(1);
    const alert = alerts[0];
    if (!alert) return;
    expect(alert.id).toBeTruthy();
    expect(alert.organizationId).toBe(orgId);
    expect(alert.domain).toBe('compliance');
    expect(alert.severity).toBe('critical');
    expect(alert.isResolved).toBe(false);
  });

  // ── 3. Alert listing returns unresolved alerts ────────────────────────────
  it('3. Alert listing returns unresolved alerts', async () => {
    const svc = new RiskAlertService(pool);

    const alerts = await svc.listAlerts(orgId);
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.isResolved).toBe(false);
    }
  });

  // ── 4. Alert listing includes resolved when requested ─────────────────────
  it('4. Alert listing includes resolved alerts when requested', async () => {
    const svc = new RiskAlertService(pool);

    const unresolved = await svc.listAlerts(orgId, false);
    const all = await svc.listAlerts(orgId, true);
    expect(all.length).toBeGreaterThanOrEqual(unresolved.length);
  });

  // ── 5. Alert resolution ───────────────────────────────────────────────────
  it('5. Alert resolution sets is_resolved = true', async () => {
    const svc = new RiskAlertService(pool);

    const resolved = await svc.resolveAlert(orgId, sharedAlertId);
    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedAt).toBeTruthy();
  });

  // ── 6. Multiple alerts created in batch ───────────────────────────────────
  it('6. Multiple alerts created in batch', async () => {
    const svc = new RiskAlertService(pool);

    const alerts = await svc.processRiskAlerts([
      {
        organizationId: orgId,
        domain: 'financial',
        severity: 'medium',
        title: 'Budget Overrun Detected A',
        description: 'Spending exceeded limit',
        score: 55,
      },
      {
        organizationId: orgId,
        domain: 'security',
        severity: 'high',
        title: 'Security Anomaly Detected A',
        description: 'Unusual access pattern',
        score: 70,
      },
    ]);

    expect(alerts.length).toBe(2);
    const domains = alerts.map((a) => a.domain);
    expect(domains).toContain('financial');
    expect(domains).toContain('security');
  });

  // ── 7. Deduplication prevents duplicate unresolved alerts ─────────────────
  it('7. Deduplication prevents duplicate unresolved alerts', async () => {
    const svc = new RiskAlertService(pool);

    const beforeCount = (await svc.listAlerts(orgId)).length;

    // Attempt to create a duplicate (same org+domain+title, within 24h)
    await svc.processRiskAlerts([
      {
        organizationId: orgId,
        domain: 'financial',
        severity: 'medium',
        title: 'Budget Overrun Detected A',
        description: 'Duplicate attempt',
        score: 55,
      },
    ]);

    const afterCount = (await svc.listAlerts(orgId)).length;
    expect(afterCount).toBe(beforeCount);
  });

  // ── 8. Resolved alert excluded from default listing ───────────────────────
  it('8. Resolved alert excluded from default listing', async () => {
    const svc = new RiskAlertService(pool);

    const unresolved = await svc.listAlerts(orgId);
    const foundResolved = unresolved.some((a) => a.id === sharedAlertId);
    expect(foundResolved).toBe(false);
  });

  // ── 9. Alert listing is tenant-scoped ────────────────────────────────────
  it('9. Alert listing is tenant-scoped', async () => {
    const svc = new RiskAlertService(pool);

    const alerts = await svc.listAlerts(orgId, true);
    for (const a of alerts) {
      expect(a.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A alerts', async () => {
    const svc = new RiskAlertService(pool);

    const alertsB = await svc.listAlerts(orgIdB, true);
    const leaked = alertsB.some((a) => a.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
