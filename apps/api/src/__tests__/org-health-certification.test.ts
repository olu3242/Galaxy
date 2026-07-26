/**
 * Org Health OS Certification Test Suite
 *
 * Certifies the Org Health module lifecycle:
 * 1.  org_health_scores table exists
 * 2.  Score recording persists a record
 * 3.  Score ≥ 70 resolves to status 'healthy'
 * 4.  Score < 40 resolves to status 'critical'
 * 5.  Score between 40–69 resolves to status 'at_risk'
 * 6.  getLatestScore returns the most recent score for a dimension
 * 7.  getAllLatestScores returns scores for all recorded dimensions
 * 8.  getTrend returns trend data for a dimension
 * 9.  Scores are tenant-scoped
 * 10. Cross-tenant isolation — org B cannot see org A scores
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { HealthScoringService } from '@galaxy/org-health';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4401-4000-8000-440000000001';
const orgIdB = '00000000-4401-4000-8000-440000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'OrgHealth Test Org A', 'orghealth-test-a', 'starter', 'active'),
            ($2, 'OrgHealth Test Org B', 'orghealth-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_health_scores WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Org Health OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. org_health_scores table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'org_health_scores' AND table_schema = 'public'`,
    );
    expect(Number(r.rows[0]?.count ?? 0), 'org_health_scores must have columns').toBeGreaterThan(0);
  });

  // ── 2. Score recording ────────────────────────────────────────────────────
  it('2. Score recording persists a record', async () => {
    const svc = new HealthScoringService(pool);

    const score = await svc.recordScore(
      orgId,
      'workflow',
      75,
      { completionRate: 0.92, avgCycleTime: 2.4 },
      ['Maintain current approval SLA'],
    );

    expect(score.id).toBeTruthy();
    expect(score.organizationId).toBe(orgId);
    expect(score.dimension).toBe('workflow');
    expect(score.score).toBe(75);
  });

  // ── 3. Score ≥ 70 is healthy ──────────────────────────────────────────────
  it('3. Score ≥ 70 resolves to status healthy', async () => {
    const svc = new HealthScoringService(pool);

    const score = await svc.recordScore(orgId, 'team', 80, {}, []);
    expect(score.status).toBe('healthy');
  });

  // ── 4. Score < 40 is critical ─────────────────────────────────────────────
  it('4. Score < 40 resolves to status critical', async () => {
    const svc = new HealthScoringService(pool);

    const score = await svc.recordScore(orgId, 'knowledge', 25, {}, ['Urgent: knowledge gaps']);
    expect(score.status).toBe('critical');
  });

  // ── 5. Score 40–69 is at_risk ────────────────────────────────────────────
  it('5. Score between 40–69 resolves to status at_risk', async () => {
    const svc = new HealthScoringService(pool);

    const score = await svc.recordScore(orgId, 'communication', 55, {}, ['Review pending items']);
    expect(score.status).toBe('at_risk');
  });

  // ── 6. getLatestScore returns most recent ─────────────────────────────────
  it('6. getLatestScore returns the most recent score for a dimension', async () => {
    const svc = new HealthScoringService(pool);

    await svc.recordScore(orgId, 'workflow', 60, {}, []);
    const latest = await svc.getLatestScore(orgId, 'workflow');

    expect(latest).not.toBeNull();
    expect(latest?.dimension).toBe('workflow');
    expect(latest?.score).toBe(60);
  });

  // ── 7. getAllLatestScores ─────────────────────────────────────────────────
  it('7. getAllLatestScores returns scores for all recorded dimensions', async () => {
    const svc = new HealthScoringService(pool);

    const scores = await svc.getAllLatestScores(orgId);
    expect(Array.isArray(scores)).toBe(true);
    expect(scores.length).toBeGreaterThan(0);
    const dimensions = scores.map((s) => s.dimension);
    expect(dimensions).toContain('workflow');
    expect(dimensions).toContain('team');
  });

  // ── 8. getTrend returns trend data ────────────────────────────────────────
  it('8. getTrend returns trend data for a dimension', async () => {
    const svc = new HealthScoringService(pool);

    const trend = await svc.getTrend(orgId, 'workflow', 30);
    expect(trend).toBeTruthy();
    expect(trend.dimension).toBe('workflow');
    expect(['improving', 'declining', 'stable']).toContain(trend.trend);
  });

  // ── 9. Scores are tenant-scoped ───────────────────────────────────────────
  it('9. Scores are tenant-scoped', async () => {
    const svc = new HealthScoringService(pool);

    const scores = await svc.getAllLatestScores(orgId);
    for (const s of scores) {
      expect(s.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A scores', async () => {
    const svc = new HealthScoringService(pool);

    const scoresB = await svc.getAllLatestScores(orgIdB);
    const leaked = scoresB.some((s) => s.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
