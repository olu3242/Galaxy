/**
 * Intelligence OS Certification Test Suite
 *
 * Certifies the Intelligence module lifecycle:
 * 1.  intelligence_snapshots table exists
 * 2.  generateInsights persists a snapshot
 * 3.  Snapshot has correct type and title
 * 4.  listInsights returns persisted snapshots
 * 5.  listInsights filters by type
 * 6.  Multiple insight types are all listed
 * 7.  Snapshot data field is populated
 * 8.  Snapshots are tenant-scoped
 * 9.  listInsights returns only org's snapshots
 * 10. Cross-tenant isolation — org B cannot see org A insights
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { InsightService } from '@galaxy/intelligence';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-4701-4000-8000-470000000001';
const orgIdB = '00000000-4701-4000-8000-470000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Intelligence Test Org A', 'intelligence-test-a', 'starter', 'active'),
            ($2, 'Intelligence Test Org B', 'intelligence-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new InsightService(pool);
  await svc.generateInsights(orgId, 'operational', {
    processedRequests: 142,
    avgResponseTime: 1.8,
  });
  await svc.generateInsights(orgId, 'workflow', {
    completionRate: 0.91,
    bottlenecks: ['finance-approval'],
  });
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM intelligence_snapshots WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Intelligence OS Certification', () => {
  // ── 1. Table exists ────────────────────────────────────────────────────────
  it('1. intelligence_snapshots table exists', async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'intelligence_snapshots' AND table_schema = 'public'`,
    );
    expect(
      Number(r.rows[0]?.count ?? 0),
      'intelligence_snapshots must have columns',
    ).toBeGreaterThan(0);
  });

  // ── 2. generateInsights persists a snapshot ───────────────────────────────
  it('2. generateInsights persists a snapshot', async () => {
    const svc = new InsightService(pool);

    const snapshot = await svc.generateInsights(orgId, 'engagement', {
      activeUsers: 87,
      messageVolume: 430,
    });

    expect(snapshot.id).toBeTruthy();
    expect(snapshot.organizationId).toBe(orgId);
    expect(snapshot.type).toBe('engagement');
  });

  // ── 3. Snapshot has correct type and title ────────────────────────────────
  it('3. Snapshot has correct type and title', async () => {
    const svc = new InsightService(pool);

    const snapshot = await svc.generateInsights(orgId, 'risk', {
      riskScore: 0.35,
      flaggedItems: 4,
    });

    expect(snapshot.type).toBe('risk');
    expect(typeof snapshot.title).toBe('string');
    expect(snapshot.title.length).toBeGreaterThan(0);
  });

  // ── 4. listInsights returns persisted snapshots ───────────────────────────
  it('4. listInsights returns persisted snapshots', async () => {
    const svc = new InsightService(pool);

    const snapshots = await svc.listInsights(orgId);
    expect(Array.isArray(snapshots)).toBe(true);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  // ── 5. listInsights filters by type ──────────────────────────────────────
  it('5. listInsights filters by type', async () => {
    const svc = new InsightService(pool);

    const snapshots = await svc.listInsights(orgId, 'operational');
    for (const s of snapshots) {
      expect(s.type).toBe('operational');
    }
    expect(snapshots.length).toBeGreaterThan(0);
  });

  // ── 6. Multiple insight types are all listed ──────────────────────────────
  it('6. Multiple insight types are all listed', async () => {
    const svc = new InsightService(pool);

    const snapshots = await svc.listInsights(orgId);
    const types = snapshots.map((s) => s.type);
    expect(types).toContain('operational');
    expect(types).toContain('workflow');
  });

  // ── 7. Snapshot data field is populated ──────────────────────────────────
  it('7. Snapshot data field is populated', async () => {
    const svc = new InsightService(pool);

    const snapshot = await svc.generateInsights(orgId, 'communication', {
      channelActivity: 'high',
      responseLatency: 2.1,
    });

    expect(snapshot.data).toBeTruthy();
    expect(typeof snapshot.data).toBe('object');
  });

  // ── 8. Snapshots are tenant-scoped ───────────────────────────────────────
  it('8. Snapshots are tenant-scoped', async () => {
    const svc = new InsightService(pool);

    const snapshots = await svc.listInsights(orgId);
    for (const s of snapshots) {
      expect(s.organizationId).toBe(orgId);
    }
  });

  // ── 9. listInsights returns only org's snapshots ──────────────────────────
  it('9. listInsights returns only org A snapshots', async () => {
    const svc = new InsightService(pool);

    const snapshots = await svc.listInsights(orgId);
    for (const s of snapshots) {
      expect(s.organizationId).toBe(orgId);
    }
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A insights', async () => {
    const svc = new InsightService(pool);

    const snapshotsB = await svc.listInsights(orgIdB);
    const leaked = snapshotsB.some((s) => s.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
