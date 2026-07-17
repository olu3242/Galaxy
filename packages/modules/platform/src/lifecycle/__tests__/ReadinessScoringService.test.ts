import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ReadinessScoringService } from '../ReadinessScoringService.js';

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
  id: 'scr-1',
  organization_id: 'org-1',
  score: '75',
  dimensions: { members: { count: 5 } },
  scored_at: '2024-01-01T00:00:00Z',
};

describe('ReadinessScoringService', () => {
  describe('recordScore', () => {
    it('sets tenant context and returns score', async () => {
      const pool = makePool([ok([]), ok([scoreRow])]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.recordScore({ organizationId: 'org-1', score: 75 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('scr-1');
      expect(result.score).toBe(75);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReadinessScoringService(pool);
      await expect(svc.recordScore({ organizationId: 'org-1', score: 50 })).rejects.toThrow(
        'Failed to record readiness score',
      );
    });
  });

  describe('getLatestScore', () => {
    it('sets tenant context and returns score', async () => {
      const pool = makePool([ok([]), ok([scoreRow])]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.getLatestScore('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result?.score).toBe(75);
    });

    it('returns null when no score found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.getLatestScore('org-missing');
      expect(result).toBeNull();
    });
  });

  describe('calculateReadiness', () => {
    it('computes score from member and workflow counts then records it', async () => {
      // set_config, members count, workflows count, set_config (recordScore), INSERT
      const pool = makePool([
        ok([]),
        ok([{ cnt: '5' }]),
        ok([{ cnt: '3' }]),
        ok([]),
        ok([scoreRow]),
      ]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.calculateReadiness('org-1');
      expect(result.id).toBe('scr-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      // first call is set_config
      expect(calls[0]?.[0]).toContain('set_config');
    });
  });
});
