/**
 * Mission Control OS Certification Test Suite
 *
 * Certifies the Mission Control module lifecycle:
 * 1.  getDashboard returns a valid MissionControlDashboard
 * 2.  OperationalSnapshot has required numeric fields
 * 3.  activeWorkflows defaults to 0 for a fresh org
 * 4.  healthScore defaults to 50 when no org_health_scores exist
 * 5.  getLearningSnapshot returns totalInsights and appliedInsights
 * 6.  getGuardianSnapshot has activeIncidents and riskAlerts
 * 7.  getDigitalTwinSnapshot has nodeCount and overallHealthScore
 * 8.  getDashboard.generatedAt is a Date instance
 * 9.  All four sub-snapshots have organizationId set correctly
 * 10. Cross-tenant isolation — org B snapshot has its own organizationId
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { MissionControlService } from '@galaxy/mission-control';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-5101-4000-8000-510000000001';
const orgIdB = '00000000-5101-4000-8000-510000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'MissionCtrl Test Org A', 'missionctrl-test-a', 'starter', 'active'),
            ($2, 'MissionCtrl Test Org B', 'missionctrl-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Mission Control OS Certification', () => {
  // ── 1. getDashboard returns valid shape ───────────────────────────────────
  it('1. getDashboard returns a valid MissionControlDashboard', async () => {
    const svc = new MissionControlService(pool);

    const dashboard = await svc.getDashboard(orgId);
    expect(dashboard).toBeTruthy();
    expect(dashboard.operational).toBeTruthy();
    expect(dashboard.learning).toBeTruthy();
    expect(dashboard.guardian).toBeTruthy();
    expect(dashboard.digitalTwin).toBeTruthy();
  });

  // ── 2. OperationalSnapshot numeric fields ─────────────────────────────────
  it('2. OperationalSnapshot has required numeric fields', async () => {
    const svc = new MissionControlService(pool);

    const snap = await svc.getOperationalSnapshot(orgId);
    expect(typeof snap.activeWorkflows).toBe('number');
    expect(typeof snap.openConversations).toBe('number');
    expect(typeof snap.activeAgents).toBe('number');
    expect(typeof snap.healthScore).toBe('number');
  });

  // ── 3. Counts default to 0 for a fresh org ────────────────────────────────
  it('3. activeWorkflows defaults to 0 for a fresh org', async () => {
    const svc = new MissionControlService(pool);

    const snap = await svc.getOperationalSnapshot(orgId);
    expect(snap.activeWorkflows).toBe(0);
    expect(snap.openConversations).toBe(0);
    expect(snap.activeAgents).toBe(0);
  });

  // ── 4. healthScore defaults to 50 ────────────────────────────────────────
  it('4. healthScore defaults to 50 when no org_health_scores exist', async () => {
    const svc = new MissionControlService(pool);

    const snap = await svc.getOperationalSnapshot(orgId);
    expect(snap.healthScore).toBe(50);
  });

  // ── 5. getLearningSnapshot ────────────────────────────────────────────────
  it('5. getLearningSnapshot returns totalInsights and appliedInsights', async () => {
    const svc = new MissionControlService(pool);

    const snap = await svc.getLearningSnapshot(orgId);
    expect(typeof snap.totalInsights).toBe('number');
    expect(typeof snap.appliedInsights).toBe('number');
    expect(snap.totalInsights).toBeGreaterThanOrEqual(0);
    expect(snap.appliedInsights).toBeGreaterThanOrEqual(0);
  });

  // ── 6. getGuardianSnapshot ────────────────────────────────────────────────
  it('6. getGuardianSnapshot has activeIncidents and riskAlerts', async () => {
    const svc = new MissionControlService(pool);

    const snap = await svc.getGuardianSnapshot(orgId);
    expect(typeof snap.activeIncidents).toBe('number');
    expect(typeof snap.riskAlerts).toBe('number');
    expect(snap.activeIncidents).toBe(0);
    expect(snap.riskAlerts).toBe(0);
  });

  // ── 7. getDigitalTwinSnapshot ─────────────────────────────────────────────
  it('7. getDigitalTwinSnapshot has nodeCount and overallHealthScore', async () => {
    const svc = new MissionControlService(pool);

    const snap = await svc.getDigitalTwinSnapshot(orgId);
    expect(typeof snap.nodeCount).toBe('number');
    expect(typeof snap.overallHealthScore).toBe('number');
    expect(snap.nodeCount).toBe(0);
    expect(snap.overallHealthScore).toBe(0);
  });

  // ── 8. generatedAt is a Date ─────────────────────────────────────────────
  it('8. getDashboard.generatedAt is a Date instance', async () => {
    const svc = new MissionControlService(pool);

    const dashboard = await svc.getDashboard(orgId);
    expect(dashboard.generatedAt).toBeInstanceOf(Date);
  });

  // ── 9. Sub-snapshots carry correct organizationId ─────────────────────────
  it('9. All four sub-snapshots have organizationId set correctly', async () => {
    const svc = new MissionControlService(pool);

    const dashboard = await svc.getDashboard(orgId);
    expect(dashboard.operational.organizationId).toBe(orgId);
    expect(dashboard.learning.organizationId).toBe(orgId);
    expect(dashboard.guardian.organizationId).toBe(orgId);
    expect(dashboard.digitalTwin.organizationId).toBe(orgId);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B snapshot has its own organizationId, not org A', async () => {
    const svc = new MissionControlService(pool);

    const dashboardB = await svc.getDashboard(orgIdB);
    expect(dashboardB.operational.organizationId).toBe(orgIdB);
    expect(dashboardB.operational.organizationId).not.toBe(orgId);
    expect(dashboardB.learning.organizationId).toBe(orgIdB);
  });
});
