/**
 * Risk Intelligence OS Certification Test Suite
 *
 * Certifies the Risk Intelligence module lifecycle:
 * 1.  risk_alerts table exists
 * 2.  Risk alert creation persists a record
 * 3.  Alert listing returns unresolved alerts
 * 4.  Alert listing includes resolved alerts when requested
 * 5.  Alert resolution sets is_resolved = true
 * 6.  Risk profile computation returns domain scores
 * 7.  Risk profile has an overall score
 * 8.  Risk profile includes all required domains
 * 9.  Resolved alert excluded from default listing
 * 10. Cross-tenant isolation — org B cannot see org A alerts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { RiskIntelligenceService, RiskAlertService } from '@galaxy/risk-intelligence';

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
  sharedAlertId = alerts[0]?.id ?? '';
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

  // ── 3. Alert listing ──────────────────────────────────────────────────────
  it('3. Alert listing returns unresolved alerts', async () => {
    const svc = new RiskAlertService(pool);

    const alerts = await svc.listAlerts(orgId);
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.isResolved).toBe(false);
    }
  });

  // ── 4. Alert listing includes resolved ───────────────────────────────────
  it('4. Alert listing includes resolved when requested', async () => {
    const svc = new RiskAlertService(pool);

    const all = await svc.listAlerts(orgId, true);
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual((await svc.listAlerts(orgId)).length);
  });

  // ── 5. Alert resolution ───────────────────────────────────────────────────
  it('5. Alert resolution sets is_resolved = true', async () => {
    const svc = new RiskAlertService(pool);

    const resolved = await svc.resolveAlert(orgId, sharedAlertId);
    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedAt).toBeTruthy();
  });

  // ── 6. Risk profile computation ───────────────────────────────────────────
  it('6. Risk profile computation returns domain scores', async () => {
    const svc = new RiskIntelligenceService(pool);

    const profile = await svc.computeOrgRiskProfile(orgId);
    expect(profile.organizationId).toBe(orgId);
    expect(Array.isArray(profile.domainScores)).toBe(true);
    expect(profile.domainScores.length).toBeGreaterThan(0);
  });

  // ── 7. Risk profile overall score ────────────────────────────────────────
  it('7. Risk profile has an overall score', async () => {
    const svc = new RiskIntelligenceService(pool);

    const profile = await svc.computeOrgRiskProfile(orgId);
    expect(typeof profile.overallScore).toBe('number');
    expect(['low', 'medium', 'high', 'critical']).toContain(profile.overallLevel);
  });

  // ── 8. Risk profile domains ───────────────────────────────────────────────
  it('8. Risk profile includes all required domains', async () => {
    const svc = new RiskIntelligenceService(pool);

    const profile = await svc.computeOrgRiskProfile(orgId);
    const domains = profile.domainScores.map((d) => d.domain);
    for (const required of ['operational', 'compliance', 'financial', 'security']) {
      expect(domains).toContain(required);
    }
  });

  // ── 9. Resolved alert excluded from default listing ───────────────────────
  it('9. Resolved alert excluded from default listing', async () => {
    const svc = new RiskAlertService(pool);

    const unresolved = await svc.listAlerts(orgId);
    const foundResolved = unresolved.some((a) => a.id === sharedAlertId);
    expect(foundResolved).toBe(false);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A alerts', async () => {
    const svc = new RiskAlertService(pool);

    const alertsB = await svc.listAlerts(orgIdB, true);
    const leaked = alertsB.some((a) => a.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
