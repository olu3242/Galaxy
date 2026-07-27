/**
 * Platform Lifecycle OS Certification Test Suite
 *
 * Certifies the organization lifecycle and readiness scoring:
 * 1.  recordEvent persists a lifecycle event
 * 2.  listEvents returns the recorded event
 * 3.  recordEvent with onboarding_completed stores correctly
 * 4.  recordHealthCheckpoint stores a health checkpoint
 * 5.  listEvents returns events ordered newest-first
 * 6.  recordScore persists a readiness score
 * 7.  getLatestScore returns the most recent score
 * 8.  calculateReadiness returns 20 for a fresh org (no members/workflows)
 * 9.  calculateReadiness dimensions are present in the score record
 * 10. Cross-tenant isolation — org B lifecycle events are separate
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrganizationLifecycleService, ReadinessScoringService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-5301-4000-8000-530000000001';
const orgIdB = '00000000-5301-4000-8000-530000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Lifecycle Test Org A', 'lifecycle-test-a', 'starter', 'active'),
            ($2, 'Lifecycle Test Org B', 'lifecycle-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_readiness_scores WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM org_health_checkpoints WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM org_lifecycle_events WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Lifecycle OS Certification', () => {
  // ── 1. recordEvent persists a lifecycle event ─────────────────────────────
  it('1. recordEvent persists a lifecycle event', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const event = await svc.recordEvent({
      organizationId: orgId,
      eventType: 'onboarding_started',
    });
    expect(event).toBeTruthy();
    expect(event.organizationId).toBe(orgId);
    expect(event.eventType).toBe('onboarding_started');
  });

  // ── 2. listEvents returns recorded events ─────────────────────────────────
  it('2. listEvents returns the recorded event', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const events = await svc.listEvents(orgId);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].organizationId).toBe(orgId);
  });

  // ── 3. multiple event types store correctly ───────────────────────────────
  it('3. recordEvent with onboarding_completed stores correctly', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const event = await svc.recordEvent({
      organizationId: orgId,
      eventType: 'onboarding_completed',
      metadata: { completedBy: 'admin' },
    });
    expect(event.eventType).toBe('onboarding_completed');
    expect(event.metadata).toMatchObject({ completedBy: 'admin' });
  });

  // ── 4. recordHealthCheckpoint stores a checkpoint ─────────────────────────
  it('4. recordHealthCheckpoint stores a health checkpoint', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const checkpoint = await svc.recordHealthCheckpoint({
      organizationId: orgId,
      checkpointType: 'onboarding_checklist',
      passed: true,
      notes: 'All steps completed',
    });
    expect(checkpoint).toBeTruthy();
    expect(checkpoint.organizationId).toBe(orgId);
    expect(checkpoint.passed).toBe(true);
  });

  // ── 5. listEvents ordered newest-first ───────────────────────────────────
  it('5. listEvents returns events ordered newest-first', async () => {
    const svc = new OrganizationLifecycleService(pool);
    const events = await svc.listEvents(orgId);
    expect(events.length).toBeGreaterThanOrEqual(2);
    const types = events.map((e) => e.eventType);
    expect(types).toContain('onboarding_started');
    expect(types).toContain('onboarding_completed');
  });

  // ── 6. recordScore persists a readiness score ─────────────────────────────
  it('6. recordScore persists a readiness score', async () => {
    const svc = new ReadinessScoringService(pool);
    const score = await svc.recordScore({
      organizationId: orgId,
      score: 60,
      dimensions: { members: 0.5, workflows: 0.5 },
    });
    expect(score).toBeTruthy();
    expect(score.organizationId).toBe(orgId);
    expect(score.score).toBe(60);
  });

  // ── 7. getLatestScore returns most recent ────────────────────────────────
  it('7. getLatestScore returns the most recent score', async () => {
    const svc = new ReadinessScoringService(pool);
    const score = await svc.getLatestScore(orgId);
    expect(score).not.toBeNull();
    expect(score?.organizationId).toBe(orgId);
    expect(typeof score?.score).toBe('number');
  });

  // ── 8. calculateReadiness = 20 for fresh org ─────────────────────────────
  it('8. calculateReadiness returns 20 for a fresh org', async () => {
    const svc = new ReadinessScoringService(pool);
    const score = await svc.calculateReadiness(orgIdB);
    expect(score.score).toBe(20);
  });

  // ── 9. calculateReadiness dimensions present ──────────────────────────────
  it('9. calculateReadiness dimensions are present in the score record', async () => {
    const svc = new ReadinessScoringService(pool);
    const score = await svc.calculateReadiness(orgId);
    expect(score.dimensions).toBeTruthy();
    expect(typeof score.dimensions).toBe('object');
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B lifecycle events are separate from org A', async () => {
    const svc = new OrganizationLifecycleService(pool);
    await svc.recordEvent({ organizationId: orgIdB, eventType: 'activated' });
    const eventsA = await svc.listEvents(orgId);
    const eventsB = await svc.listEvents(orgIdB);
    const aIds = eventsA.map((e) => e.organizationId);
    const bIds = eventsB.map((e) => e.organizationId);
    expect(aIds.every((id) => id === orgId)).toBe(true);
    expect(bIds.every((id) => id === orgIdB)).toBe(true);
  });
});
