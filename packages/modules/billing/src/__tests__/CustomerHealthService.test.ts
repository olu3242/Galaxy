import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { CustomerHealthService } from '../revenue/CustomerHealthService.js';

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

const recentDate = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago

describe('CustomerHealthService', () => {
  describe('computeHealth', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: null, event_count: '0' }]),
        ok([{ last_payment: null, failed_count: '0' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      await svc.computeHealth('org-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[0]?.[1]).toContain('org-1');
    });

    it('returns health with correct organizationId', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: null, event_count: '0' }]),
        ok([{ last_payment: null, failed_count: '0' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      expect(health.organizationId).toBe('org-1');
    });

    it('returns grade F for inactive customer with no payments', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: null, event_count: '0' }]),
        ok([{ last_payment: null, failed_count: '0' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      expect(health.grade).toBe('F');
      expect(health.activityScore).toBe(0);
      expect(health.paymentScore).toBe(34);
    });

    it('returns high health score for active customer with no failed payments', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: recentDate, event_count: '200' }]),
        ok([{ last_payment: recentDate, failed_count: '0' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      // activityScore=33 (200>100), engagementScore=33 (< 1 day), paymentScore=34
      expect(health.healthScore).toBe(100);
      expect(health.grade).toBe('A');
    });

    it('reduces payment score for one failed payment', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: recentDate, event_count: '200' }]),
        ok([{ last_payment: recentDate, failed_count: '1' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      expect(health.paymentScore).toBe(20);
    });

    it('sets paymentScore to 0 for multiple failed payments', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: null, event_count: '0' }]),
        ok([{ last_payment: null, failed_count: '3' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      expect(health.paymentScore).toBe(0);
    });

    it('sets lastPaymentAt and lastActivityAt from db', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: recentDate, event_count: '10' }]),
        ok([{ last_payment: recentDate, failed_count: '0' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      expect(health.lastActivityAt).toBe(recentDate);
      expect(health.lastPaymentAt).toBe(recentDate);
    });

    it('includes measuredAt timestamp', async () => {
      const pool = makePool([
        ok([]),
        ok([{ last_activity: null, event_count: '0' }]),
        ok([{ last_payment: null, failed_count: '0' }]),
      ]);
      const svc = new CustomerHealthService(pool);
      const health = await svc.computeHealth('org-1');
      expect(health.measuredAt).toBeDefined();
      expect(new Date(health.measuredAt).getTime()).toBeGreaterThan(0);
    });
  });
});
