import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { UsageMeteringService } from '../UsageMeteringService.js';

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

const eventRow = {
  id: 'ue-1',
  organization_id: 'org-1',
  resource_type: 'api_calls',
  quantity: '5',
  metadata: {},
  recorded_at: '2024-01-01T00:00:00Z',
};

const recordRow = {
  id: 'ur-1',
  organization_id: 'org-1',
  period_start: '2024-01-01T00:00:00Z',
  period_end: '2024-02-01T00:00:00Z',
  resource_type: 'api_calls',
  total_quantity: '500',
  created_at: '2024-01-01T00:00:00Z',
};

describe('UsageMeteringService', () => {
  describe('recordEvent', () => {
    it('sets tenant context and returns event', async () => {
      const pool = makePool([ok([]), ok([eventRow])]);
      const svc = new UsageMeteringService(pool);
      const result = await svc.recordEvent({
        organizationId: 'org-1',
        resourceType: 'api_calls',
        quantity: 5,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('ue-1');
      expect(result.quantity).toBe(5);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new UsageMeteringService(pool);
      await expect(
        svc.recordEvent({ organizationId: 'org-1', resourceType: 'x', quantity: 1 }),
      ).rejects.toThrow('Failed to record usage event');
    });
  });

  describe('queryEvents', () => {
    it('sets tenant context and returns events', async () => {
      const pool = makePool([ok([]), ok([eventRow])]);
      const svc = new UsageMeteringService(pool);
      const result = await svc.queryEvents({ organizationId: 'org-1' });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.resourceType).toBe('api_calls');
    });

    it('returns empty array when no events', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new UsageMeteringService(pool);
      const result = await svc.queryEvents({ organizationId: 'org-1' });
      expect(result).toHaveLength(0);
    });

    it('passes resourceType, since, and limit filters', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new UsageMeteringService(pool);
      const since = new Date('2024-01-01');
      await svc.queryEvents({
        organizationId: 'org-1',
        resourceType: 'api_calls',
        since,
        limit: 5,
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1]?.[1] ?? []) as unknown[];
      expect(params).toContain('api_calls');
      expect(params).toContain(since.toISOString());
      expect(params).toContain(5);
    });
  });

  describe('getUsageRecords', () => {
    it('sets tenant context and returns records', async () => {
      const pool = makePool([ok([]), ok([recordRow])]);
      const svc = new UsageMeteringService(pool);
      const result = await svc.getUsageRecords('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.totalQuantity).toBe(500);
    });

    it('passes resourceType and limit filters', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new UsageMeteringService(pool);
      await svc.getUsageRecords('org-1', { resourceType: 'api_calls', limit: 10 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1]?.[1] ?? []) as unknown[];
      expect(params).toContain('api_calls');
      expect(params).toContain(10);
    });
  });
});
