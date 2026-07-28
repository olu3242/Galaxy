/**
 * Revenue Operations Service Certification Test Suite — Phase 84
 *
 * Certifies RevenueOperationsService from @galaxy/platform:
 * 1.  recordSnapshot creates a revenue snapshot
 * 2.  snapshot has correct mrrCents and arrCents
 * 3.  getLatestSnapshot returns the most recent snapshot
 * 4.  getSnapshotHistory returns an array
 * 5.  getSnapshotHistory respects limit
 * 6.  getMrrTrend returns an array of trend data
 * 7.  getMrrTrend entries have mrrCents and snapshotDate
 * 8.  getChurnRate returns a numeric churn rate
 * 9.  multiple snapshots — getLatestSnapshot returns most recent
 * 10. getSnapshotHistory returns entries in descending date order
 */

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { RevenueOperationsService, type RevenueSnapshot } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool
    .query(`DELETE FROM revenue_snapshots WHERE mrr_cents IN (100000, 200000, 300000, 150000)`)
    .catch(() => null);
  await pool.end();
});

describe('Revenue Operations Service Certification', () => {
  // ── 1. recordSnapshot creates snapshot ────────────────────────────────────
  it('1. recordSnapshot creates a revenue snapshot', async () => {
    const svc = new RevenueOperationsService(pool);
    const snapshot: RevenueSnapshot = await svc.recordSnapshot({
      mrrCents: 100000,
      arrCents: 1200000,
      activeSubscriptions: 10,
      churnedThisMonth: 1,
      newThisMonth: 2,
      snapshotDate: '2026-01-01',
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot.id).toBeTruthy();
  });

  // ── 2. snapshot has correct mrr and arr ────────────────────────────────
  it('2. snapshot has correct mrrCents and arrCents', async () => {
    const svc = new RevenueOperationsService(pool);
    const snapshot: RevenueSnapshot = await svc.recordSnapshot({
      mrrCents: 200000,
      arrCents: 2400000,
      activeSubscriptions: 20,
      churnedThisMonth: 0,
      newThisMonth: 3,
      snapshotDate: '2026-02-01',
    });
    expect(snapshot.mrrCents).toBe(200000);
    expect(snapshot.arrCents).toBe(2400000);
  });

  // ── 3. getLatestSnapshot returns most recent ──────────────────────────────
  it('3. getLatestSnapshot returns the most recent snapshot', async () => {
    const svc = new RevenueOperationsService(pool);
    const snapshot: RevenueSnapshot | null = await svc.getLatestSnapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot?.id).toBeTruthy();
  });

  // ── 4. getSnapshotHistory returns array ───────────────────────────────────
  it('4. getSnapshotHistory returns an array of snapshots', async () => {
    const svc = new RevenueOperationsService(pool);
    const history: RevenueSnapshot[] = await svc.getSnapshotHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  // ── 5. getSnapshotHistory respects limit ──────────────────────────────────
  it('5. getSnapshotHistory respects limit option', async () => {
    const svc = new RevenueOperationsService(pool);
    const history: RevenueSnapshot[] = await svc.getSnapshotHistory({ limit: 1 });
    expect(history.length).toBeLessThanOrEqual(1);
  });

  // ── 6. getMrrTrend returns array ──────────────────────────────────────────
  it('6. getMrrTrend returns an array of trend data', async () => {
    const svc = new RevenueOperationsService(pool);
    const trend: { mrrCents: number; snapshotDate: string }[] = await svc.getMrrTrend();
    expect(Array.isArray(trend)).toBe(true);
    expect(trend.length).toBeGreaterThan(0);
  });

  // ── 7. trend entries have mrrCents and snapshotDate ───────────────────────
  it('7. getMrrTrend entries have mrrCents and snapshotDate', async () => {
    const svc = new RevenueOperationsService(pool);
    const trend: { mrrCents: number; snapshotDate: string }[] = await svc.getMrrTrend();
    const entry = trend[0];
    expect(entry).toBeTruthy();
    expect(typeof entry?.mrrCents).toBe('number');
    expect(entry?.snapshotDate).toBeTruthy();
  });

  // ── 8. getChurnRate returns numeric churn rate ────────────────────────────
  it('8. getChurnRate returns a numeric churn rate', async () => {
    const svc = new RevenueOperationsService(pool);
    const rate = await svc.getChurnRate();
    expect(typeof rate).toBe('number');
    expect(rate).toBeGreaterThanOrEqual(0);
  });

  // ── 9. multiple snapshots — getLatestSnapshot returns most recent ──────────
  it('9. after inserting newer snapshot, getLatestSnapshot returns it', async () => {
    const svc = new RevenueOperationsService(pool);
    await svc.recordSnapshot({
      mrrCents: 300000,
      arrCents: 3600000,
      activeSubscriptions: 30,
      churnedThisMonth: 0,
      newThisMonth: 5,
      snapshotDate: '2026-03-01',
    });
    const latest: RevenueSnapshot | null = await svc.getLatestSnapshot();
    expect(latest?.mrrCents).toBe(300000);
  });

  // ── 10. history returns entries in descending date order ──────────────────
  it('10. getSnapshotHistory returns entries ordered by date descending', async () => {
    const svc = new RevenueOperationsService(pool);
    const history: RevenueSnapshot[] = await svc.getSnapshotHistory({ limit: 3 });
    expect(history.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (prev && curr) {
        expect(prev.snapshotDate >= curr.snapshotDate).toBe(true);
      }
    }
  });
});
