import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RevenueOperationsService } from '../RevenueOperationsService.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const snapshotRow = {
  id: 'rev-1',
  mrr_cents: '100000',
  arr_cents: '1200000',
  active_subscriptions: '50',
  churned_this_month: '2',
  new_this_month: '5',
  snapshot_date: '2024-01-01',
  created_at: '2024-01-01T00:00:00Z',
};

describe('RevenueOperationsService', () => {
  describe('recordSnapshot', () => {
    it('returns recorded snapshot', async () => {
      const pool = makePool([ok([snapshotRow])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.recordSnapshot({
        mrrCents: 100000,
        arrCents: 1200000,
        activeSubscriptions: 50,
        churnedThisMonth: 2,
        newThisMonth: 5,
      });
      expect(result.id).toBe('rev-1');
      expect(result.mrrCents).toBe(100000);
      expect(result.arrCents).toBe(1200000);
      expect(result.activeSubscriptions).toBe(50);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new RevenueOperationsService(pool);
      await expect(
        svc.recordSnapshot({
          mrrCents: 0,
          arrCents: 0,
          activeSubscriptions: 0,
          churnedThisMonth: 0,
          newThisMonth: 0,
        }),
      ).rejects.toThrow('Failed to record revenue snapshot');
    });
  });

  describe('listSnapshots', () => {
    it('returns list of snapshots', async () => {
      const pool = makePool([ok([snapshotRow])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.listSnapshots({ limit: 5 });
      expect(result[0]?.snapshotDate).toBe('2024-01-01');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain(5);
    });

    it('returns empty array when no snapshots', async () => {
      const pool = makePool([ok([])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.listSnapshots();
      expect(result).toHaveLength(0);
    });
  });

  describe('calculateCurrentMrr', () => {
    it('returns calculated MRR', async () => {
      const pool = makePool([ok([{ mrr: '150000' }])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.calculateCurrentMrr();
      expect(result).toBe(150000);
    });

    it('returns 0 when no subscriptions', async () => {
      const pool = makePool([ok([{ mrr: '0' }])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.calculateCurrentMrr();
      expect(result).toBe(0);
    });
  });

  describe('getChurnRate', () => {
    it('calculates churn rate correctly', async () => {
      const pool = makePool([ok([{ total: '100', churned: '5' }])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.getChurnRate();
      expect(result).toBeCloseTo(0.05);
    });

    it('returns 0 when no subscriptions', async () => {
      const pool = makePool([ok([{ total: '0', churned: '0' }])]);
      const svc = new RevenueOperationsService(pool);
      const result = await svc.getChurnRate();
      expect(result).toBe(0);
    });
  });
});
