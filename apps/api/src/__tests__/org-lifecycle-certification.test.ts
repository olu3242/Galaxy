/**
 * Organization Lifecycle Certification Test Suite — Phase 72
 *
 * Certifies OrganizationLifecycleService and ReadinessScoringService
 * from @galaxy/platform-admin:
 * 1.  getLifecycleState returns a state object
 * 2.  state has correct organizationId
 * 3.  state.stage is one of the known lifecycle stages
 * 4.  state has completedSteps and pendingSteps arrays
 * 5.  state.healthScore is >= 0
 * 6.  startOnboarding completes without error
 * 7.  completeOnboarding completes without error
 * 8.  computeScore returns a ReadinessScore
 * 9.  ReadinessScore has a breakdown and a letter grade
 * 10. Cross-scope: orgA and orgB have separate lifecycle states
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrganizationLifecycleService, ReadinessScoringService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7201-4000-8000-720100000001';
const orgIdB = '00000000-7201-4000-8000-720100000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Lifecycle Phase 72 Org A', 'lifecycle-phase72-a', 'starter', 'active'),
            ($2, 'Lifecycle Phase 72 Org B', 'lifecycle-phase72-b', 'growth', 'active')
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

describe('Organization Lifecycle Certification', () => {
  // ── 1. getLifecycleState returns state object ─────────────────────────────
  it('1. getLifecycleState returns a lifecycle state object', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const state = await svc.getLifecycleState(orgId);
    expect(state).toBeTruthy();
  });

  // ── 2. state has organizationId ───────────────────────────────────────────
  it('2. lifecycle state has the correct organizationId', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const state = await svc.getLifecycleState(orgId);
    expect(state.organizationId).toBe(orgId);
  });

  // ── 3. state.stage is a known value ───────────────────────────────────────
  it('3. lifecycle state.stage is one of the known stages', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const state = await svc.getLifecycleState(orgId);
    expect(['onboarding', 'activation', 'growth', 'mature', 'offboarding']).toContain(state.stage);
  });

  // ── 4. state has steps arrays ─────────────────────────────────────────────
  it('4. lifecycle state has completedSteps and pendingSteps arrays', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const state = await svc.getLifecycleState(orgId);
    expect(Array.isArray(state.completedSteps)).toBe(true);
    expect(Array.isArray(state.pendingSteps)).toBe(true);
  });

  // ── 5. state.healthScore >= 0 ─────────────────────────────────────────────
  it('5. lifecycle state.healthScore is a non-negative number', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const state = await svc.getLifecycleState(orgId);
    expect(typeof state.healthScore).toBe('number');
    expect(state.healthScore).toBeGreaterThanOrEqual(0);
  });

  // ── 6. startOnboarding completes ─────────────────────────────────────────
  it('6. startOnboarding completes without throwing', async () => {
    const svc = new OrganizationLifecycleService(pool);
    await expect(svc.startOnboarding(orgId)).resolves.not.toThrow();
  });

  // ── 7. completeOnboarding completes ──────────────────────────────────────
  it('7. completeOnboarding completes without throwing', async () => {
    const svc = new OrganizationLifecycleService(pool);
    await expect(svc.completeOnboarding(orgId)).resolves.not.toThrow();
  });

  // ── 8. computeScore returns ReadinessScore ────────────────────────────────
  it('8. ReadinessScoringService.computeScore returns a score', async () => {
    const svc = new ReadinessScoringService(pool);
    const score = await svc.computeScore(orgId);
    expect(score).toBeTruthy();
    expect(score.organizationId).toBe(orgId);
    expect(typeof score.score).toBe('number');
  });

  // ── 9. score has breakdown and grade ─────────────────────────────────────
  it('9. ReadinessScore has a breakdown object and a letter grade', async () => {
    const svc = new ReadinessScoringService(pool);
    const score = await svc.computeScore(orgId);
    expect(score.breakdown).toBeTruthy();
    expect(typeof score.breakdown.memberScore).toBe('number');
    expect(typeof score.breakdown.workflowScore).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(score.grade);
  });

  // ── 10. Cross-scope isolation ─────────────────────────────────────────────
  it('10. lifecycle state for orgB has orgB organizationId (cross-scope)', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const stateA = await svc.getLifecycleState(orgId);
    const stateB = await svc.getLifecycleState(orgIdB);
    expect(stateA.organizationId).toBe(orgId);
    expect(stateB.organizationId).toBe(orgIdB);
    expect(stateA.organizationId).not.toBe(stateB.organizationId);
  });
});
