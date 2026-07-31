/**
 * Customer Health Service Certification Test Suite — Phase 85
 *
 * Certifies CustomerHealthService from @galaxy/platform:
 * 1.  recordScore creates a health score record
 * 2.  recorded score has correct organizationId and score
 * 3.  getLatestScore returns the most recent score
 * 4.  getLatestScore returns null for org with no scores
 * 5.  listHealthScores returns an array
 * 6.  listHealthScores filters by minScore
 * 7.  listHealthScores filters by maxScore
 * 8.  calculateHealthScore returns a computed score
 * 9.  calculateHealthScore score is in [0, 100]
 * 10. Cross-org: getLatestScore is separate per org
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { CustomerHealthService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-8501-4000-8000-850100000001';
const orgIdB = '00000000-8501-4000-8000-850100000002';
const orgIdC = '00000000-8501-4000-8000-850100000003';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'CustomerHealth Phase 85 Org A', 'customerhealth-phase85-a', 'starter', 'active'),
            ($2, 'CustomerHealth Phase 85 Org B', 'customerhealth-phase85-b', 'starter', 'active'),
            ($3, 'CustomerHealth Phase 85 Org C', 'customerhealth-phase85-c', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB, orgIdC],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM customer_health_scores WHERE organization_id IN ($1, $2, $3)`, [
      orgId,
      orgIdB,
      orgIdC,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2, $3)`, [orgId, orgIdB, orgIdC])
    .catch(() => null);
  await pool.end();
});

describe('Customer Health Service Certification', () => {
  // ── 1. recordScore creates a health score ────────────────────────────────
  it('1. recordScore creates a health score record', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.recordScore({
      organizationId: orgId,
      score: 75,
      factors: { engagement: 0.8 },
    });
    expect(score).toBeTruthy();
    expect(score.id).toBeTruthy();
  });

  // ── 2. recorded score has correct org and score ───────────────────────────
  it('2. recorded score has correct organizationId and score', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.recordScore({ organizationId: orgId, score: 80 });
    expect(score.organizationId).toBe(orgId);
    expect(score.score).toBe(80);
  });

  // ── 3. getLatestScore returns most recent ────────────────────────────────
  it('3. getLatestScore returns the most recent score for the org', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.getLatestScore(orgId);
    expect(score).toBeTruthy();
    expect(score?.organizationId).toBe(orgId);
    expect(score?.score).toBe(80);
  });

  // ── 4. getLatestScore returns null for org with no scores ─────────────────
  it('4. getLatestScore returns null for org with no scores', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.getLatestScore(orgIdC);
    expect(score).toBeNull();
  });

  // ── 5. listHealthScores returns array ────────────────────────────────────
  it('5. listHealthScores returns an array of scores', async () => {
    const svc = new CustomerHealthService(pool);
    await svc.recordScore({ organizationId: orgIdB, score: 55 });
    const scores = await svc.listHealthScores();
    expect(Array.isArray(scores)).toBe(true);
    expect(scores.length).toBeGreaterThan(0);
  });

  // ── 6. listHealthScores filters by minScore ──────────────────────────────
  it('6. listHealthScores filters by minScore', async () => {
    const svc = new CustomerHealthService(pool);
    const scores = await svc.listHealthScores({ minScore: 70 });
    expect(scores.every((s) => s.score >= 70)).toBe(true);
  });

  // ── 7. listHealthScores filters by maxScore ──────────────────────────────
  it('7. listHealthScores filters by maxScore', async () => {
    const svc = new CustomerHealthService(pool);
    const scores = await svc.listHealthScores({ maxScore: 60 });
    expect(scores.every((s) => s.score <= 60)).toBe(true);
  });

  // ── 8. calculateHealthScore returns a score ───────────────────────────────
  it('8. calculateHealthScore returns a computed CustomerHealthScore', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.calculateHealthScore(orgId);
    expect(score).toBeTruthy();
    expect(score.organizationId).toBe(orgId);
    expect(typeof score.score).toBe('number');
  });

  // ── 9. calculateHealthScore score in [0, 100] ────────────────────────────
  it('9. calculateHealthScore returns a score in [0, 100]', async () => {
    const svc = new CustomerHealthService(pool);
    const score = await svc.calculateHealthScore(orgId);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  // ── 10. Cross-org: getLatestScore is separate ────────────────────────────
  it('10. getLatestScore is separate per org', async () => {
    const svc = new CustomerHealthService(pool);
    const scoreA = await svc.getLatestScore(orgId);
    const scoreB = await svc.getLatestScore(orgIdB);
    expect(scoreA?.organizationId).toBe(orgId);
    expect(scoreB?.organizationId).toBe(orgIdB);
    expect(scoreA?.organizationId).not.toBe(scoreB?.organizationId);
  });
});
