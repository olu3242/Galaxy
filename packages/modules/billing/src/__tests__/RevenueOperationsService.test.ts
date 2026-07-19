import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RevenueOperationsService } from '../revenue/RevenueOperationsService.js';

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

describe('RevenueOperationsService', () => {
  describe('getRevenueMetrics', () => {
    it('computes mrr and arr from active subscriptions', async () => {
      const pool = makePool([
        ok([{ mrr: '10000', count: '5' }]),
        ok([{ churned_revenue: '0', churned_count: '0' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(metrics.mrrCents).toBe(10000);
      expect(metrics.arrCents).toBe(120000);
      expect(metrics.activeSubscriptions).toBe(5);
    });

    it('computes expansion revenue as 5% of mrr', async () => {
      const pool = makePool([
        ok([{ mrr: '10000', count: '5' }]),
        ok([{ churned_revenue: '0', churned_count: '0' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(metrics.expansionRevenueCents).toBe(500);
    });

    it('computes net revenue as mrr - churned + expansion', async () => {
      const pool = makePool([
        ok([{ mrr: '10000', count: '5' }]),
        ok([{ churned_revenue: '2000', churned_count: '1' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(metrics.netRevenueCents).toBe(10000 - 2000 + 500);
    });

    it('computes churn rate correctly', async () => {
      const pool = makePool([
        ok([{ mrr: '10000', count: '9' }]),
        ok([{ churned_revenue: '2000', churned_count: '1' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      // totalBase = 9 + 1 = 10, churnRate = 1/10 = 0.1 -> 10.00
      expect(metrics.churnRate).toBe(10);
    });

    it('computes retention rate as 1 - churnRate', async () => {
      const pool = makePool([
        ok([{ mrr: '10000', count: '9' }]),
        ok([{ churned_revenue: '2000', churned_count: '1' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(metrics.retentionRate).toBe(90);
    });

    it('returns zero churn rate when no subscriptions', async () => {
      const pool = makePool([
        ok([{ mrr: '0', count: '0' }]),
        ok([{ churned_revenue: '0', churned_count: '0' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(metrics.churnRate).toBe(0);
      expect(metrics.retentionRate).toBe(100);
    });

    it('handles empty result rows with defaults', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(metrics.mrrCents).toBe(0);
      expect(metrics.arrCents).toBe(0);
      expect(metrics.activeSubscriptions).toBe(0);
    });

    it('passes period params to churn query when provided', async () => {
      const pool = makePool([
        ok([{ mrr: '0', count: '0' }]),
        ok([{ churned_revenue: '0', churned_count: '0' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      await svc.getRevenueMetrics({ start: '2024-01-01', end: '2024-01-31' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[1] as [string, unknown[]])[1]).toContain('2024-01-01');
      expect((calls[1] as [string, unknown[]])[1]).toContain('2024-01-31');
    });

    it('includes measuredAt timestamp', async () => {
      const pool = makePool([
        ok([{ mrr: '0', count: '0' }]),
        ok([{ churned_revenue: '0', churned_count: '0' }]),
      ]);
      const svc = new RevenueOperationsService(pool);
      const metrics = await svc.getRevenueMetrics();
      expect(new Date(metrics.measuredAt).getTime()).toBeGreaterThan(0);
    });
  });
});
