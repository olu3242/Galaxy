import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { CustomerHealthService } from '../CustomerHealthService.js';

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

const scoreRow = {
  id: 'chs-1',
  organization_id: 'org-1',
  score: '85',
  factors: { activity: { count: 50 } },
  scored_at: '2024-01-01T00:00:00Z',
};

describe('CustomerHealthService', () => {
  describe('recordScore', () => {
    it('returns recorded score', async () => {
      const pool = makePool([ok([scoreRow])]);
      const svc = new CustomerHealthService(pool);
      const result = await svc.recordScore({ organizationId: 'org-1', score: 85 });
      expect(result.id).toBe('chs-1');
      expect(result.score).toBe(85);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new CustomerHealthService(pool);
      await expect(svc.recordScore({ organizationId: 'org-1', score: 50 })).rejects.toThrow(
        'Failed to record customer health score',
      );
    });
  });

  describe('getLatestScore', () => {
    it('returns latest score for org', async () => {
      const pool = makePool([ok([scoreRow])]);
      const svc = new CustomerHealthService(pool);
      const result = await svc.getLatestScore('org-1');
      expect(result?.score).toBe(85);
    });

    it('returns null when no score found', async () => {
      const pool = makePool([ok([])]);
      const svc = new CustomerHealthService(pool);
      const result = await svc.getLatestScore('org-missing');
      expect(result).toBeNull();
    });
  });

  describe('listHealthScores', () => {
    it('returns scores with no filter', async () => {
      const pool = makePool([ok([scoreRow])]);
      const svc = new CustomerHealthService(pool);
      const result = await svc.listHealthScores();
      expect(result[0]?.organizationId).toBe('org-1');
    });

    it('passes score range filters', async () => {
      const pool = makePool([ok([scoreRow])]);
      const svc = new CustomerHealthService(pool);
      await svc.listHealthScores({ minScore: 50, maxScore: 100, limit: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain(50);
      expect(params).toContain(100);
      expect(params).toContain(5);
    });
  });

  describe('calculateHealthScore', () => {
    it('computes and records score from activity and subscription signals', async () => {
      // activity count + subscription status (Promise.all), then recordScore INSERT
      const pool = makePool([ok([{ cnt: '100' }]), ok([{ status: 'active' }]), ok([scoreRow])]);
      const svc = new CustomerHealthService(pool);
      const result = await svc.calculateHealthScore('org-1');
      expect(result.id).toBe('chs-1');
    });
  });
});
