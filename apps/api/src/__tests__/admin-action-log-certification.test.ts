/**
 * Admin Action Log & Platform Health Certification Test Suite — Phase 73
 *
 * Certifies AdminActionLogService and PlatformHealthService
 * from @galaxy/platform-admin:
 * 1.  logAction creates an admin action record
 * 2.  logAction result has correct adminId and actionType
 * 3.  listActions returns an array
 * 4.  listActions includes the logged action
 * 5.  listActions filters by adminId
 * 6.  listActions filters by actionType
 * 7.  getAction by id returns the action
 * 8.  getAction for non-existent id returns null
 * 9.  PlatformHealthService.runHealthChecks returns a report
 * 10. health report has healthScore and slos array with known entries
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { AdminActionLogService, PlatformHealthService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7301-4000-8000-730100000001';
const adminId = 'cert73-admin';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Admin Log Phase 73 Org', 'adminlog-phase73', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM admin_action_logs WHERE admin_id = $1`, [adminId])
    .catch(() => null);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]).catch(() => null);
  await pool.end();
});

describe('Admin Action Log & Platform Health Certification', () => {
  let actionId: string;

  // ── 1. logAction creates a record ─────────────────────────────────────────
  it('1. logAction creates an admin action record', async () => {
    const svc = new AdminActionLogService(pool);
    const action = await svc.logAction({
      adminId,
      actionType: 'suspend_tenant',
      payload: { reason: 'cert73 test' },
      targetTenantId: orgId,
    });
    expect(action).toBeTruthy();
    expect(action.id).toBeTruthy();
    actionId = action.id;
  });

  // ── 2. logAction result has correct fields ────────────────────────────────
  it('2. logAction result has correct adminId and actionType', async () => {
    const svc = new AdminActionLogService(pool);
    const action = await svc.logAction({
      adminId,
      actionType: 'reinstate_tenant',
      payload: {},
    });
    expect(action.adminId).toBe(adminId);
    expect(action.actionType).toBe('reinstate_tenant');
  });

  // ── 3. listActions returns array ──────────────────────────────────────────
  it('3. listActions returns an array of actions', async () => {
    const svc = new AdminActionLogService(pool);
    const actions = await svc.listActions({ adminId });
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });

  // ── 4. listActions includes the logged action ─────────────────────────────
  it('4. listActions includes the action logged in test 1', async () => {
    const svc = new AdminActionLogService(pool);
    const actions = await svc.listActions({ adminId });
    const found = actions.find((a) => a.id === actionId);
    expect(found).toBeTruthy();
  });

  // ── 5. listActions filters by adminId ────────────────────────────────────
  it('5. listActions filters by adminId', async () => {
    const svc = new AdminActionLogService(pool);
    const actions = await svc.listActions({ adminId: 'nonexistent-admin-xyz' });
    expect(actions.length).toBe(0);
  });

  // ── 6. listActions filters by actionType ─────────────────────────────────
  it('6. listActions filters by actionType', async () => {
    const svc = new AdminActionLogService(pool);
    const actions = await svc.listActions({ adminId, actionType: 'suspend_tenant' });
    expect(actions.every((a) => a.actionType === 'suspend_tenant')).toBe(true);
  });

  // ── 7. getAction returns the action by id ────────────────────────────────
  it('7. getAction returns the correct action by id', async () => {
    const svc = new AdminActionLogService(pool);
    const action = await svc.getAction(actionId);
    expect(action).toBeTruthy();
    expect(action?.id).toBe(actionId);
    expect(action?.adminId).toBe(adminId);
  });

  // ── 8. getAction returns null for non-existent ───────────────────────────
  it('8. getAction returns null for a non-existent id', async () => {
    const svc = new AdminActionLogService(pool);
    const action = await svc.getAction('00000000-0000-0000-0000-000000000000');
    expect(action).toBeNull();
  });

  // ── 9. runHealthChecks returns a report ──────────────────────────────────
  it('9. PlatformHealthService.runHealthChecks returns a report', async () => {
    const svc = new PlatformHealthService(pool);
    const report = await svc.runHealthChecks();
    expect(report).toBeTruthy();
    expect(report.generatedAt).toBeTruthy();
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  // ── 10. health report has healthScore and slos ───────────────────────────
  it('10. health report has healthScore in [0,100] and slos with known names', async () => {
    const svc = new PlatformHealthService(pool);
    const report = await svc.runHealthChecks();
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.slos)).toBe(true);
    const sloNames = report.slos.map((s) => s.name);
    expect(sloNames).toContain('availability');
    expect(sloNames).toContain('db_latency_ms');
  });
});
