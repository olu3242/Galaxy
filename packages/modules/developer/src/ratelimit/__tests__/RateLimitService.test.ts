import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RateLimitService } from '../RateLimitService.js';

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

describe('RateLimitService', () => {
  describe('checkRateLimit', () => {
    it('returns allowed=true when under limit', async () => {
      const pool = makePool([ok([{ request_count: '5' }])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkRateLimit('org-1', 'key-1', 3600, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(995);
      expect(result.limit).toBe(1000);
    });

    it('returns allowed=false when at limit', async () => {
      const pool = makePool([ok([{ request_count: '1000' }])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkRateLimit('org-1', 'key-1', 3600, 1000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('returns 0 remaining (clamped) when over limit', async () => {
      const pool = makePool([ok([{ request_count: '1500' }])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkRateLimit('org-1', 'key-1', 3600, 1000);
      expect(result.remaining).toBe(0);
    });

    it('uses default limit of 1000 when no override', async () => {
      const pool = makePool([ok([{ request_count: '0' }])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkRateLimit('org-1', 'key-1');
      expect(result.limit).toBe(1000);
    });

    it('handles missing row by treating count as 0', async () => {
      const pool = makePool([ok([])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkRateLimit('org-1', 'key-1', 3600, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1000);
    });
  });

  describe('recordRequest', () => {
    it('inserts a rate limit event', async () => {
      const pool = makePool([ok([])]);
      const svc = new RateLimitService(pool);
      await expect(svc.recordRequest('org-1', 'key-1')).resolves.toBeUndefined();
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const firstCall = calls[0];
      expect(firstCall?.[0]).toContain('INSERT INTO rate_limit_events');
    });
  });

  describe('checkAndRecord', () => {
    it('records request when allowed', async () => {
      // checkRateLimit SELECT then recordRequest INSERT
      const pool = makePool([ok([{ request_count: '5' }]), ok([])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkAndRecord('org-1', 'key-1', 3600, 1000);
      expect(result.allowed).toBe(true);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
    });

    it('does not record when not allowed', async () => {
      const pool = makePool([ok([{ request_count: '1000' }])]);
      const svc = new RateLimitService(pool);
      const result = await svc.checkAndRecord('org-1', 'key-1', 3600, 1000);
      expect(result.allowed).toBe(false);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(1);
    });
  });

  describe('getOrgRateLimit', () => {
    it('returns org-level rate limit result', async () => {
      const pool = makePool([ok([{ request_count: '200' }])]);
      const svc = new RateLimitService(pool);
      const result = await svc.getOrgRateLimit('org-1', 3600, 500);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(300);
      expect(result.limit).toBe(500);
    });
  });

  describe('purgeOldEvents', () => {
    it('returns the rowCount of deleted rows', async () => {
      const deleteResult: QueryResult = {
        rows: [],
        rowCount: 42,
        command: 'DELETE',
        oid: 0,
        fields: [],
      };
      const pool = makePool([deleteResult]);
      const svc = new RateLimitService(pool);
      const count = await svc.purgeOldEvents(86400);
      expect(count).toBe(42);
    });

    it('returns 0 when rowCount is null', async () => {
      const deleteResult: QueryResult = {
        rows: [],
        rowCount: null,
        command: 'DELETE',
        oid: 0,
        fields: [],
      };
      const pool = makePool([deleteResult]);
      const svc = new RateLimitService(pool);
      const count = await svc.purgeOldEvents();
      expect(count).toBe(0);
    });
  });
});
