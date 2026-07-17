import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { MetricsService } from '../MetricsService.js';

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

const metricRow = {
  id: 'met-1',
  metric_name: 'api_requests',
  value: '1234',
  labels: { endpoint: '/health' },
  recorded_at: '2024-01-01T00:00:00Z',
};

describe('MetricsService', () => {
  describe('record', () => {
    it('returns recorded metric', async () => {
      const pool = makePool([ok([metricRow])]);
      const svc = new MetricsService(pool);
      const result = await svc.record({ metricName: 'api_requests', value: 1234 });
      expect(result.id).toBe('met-1');
      expect(result.value).toBe(1234);
      expect(result.metricName).toBe('api_requests');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new MetricsService(pool);
      await expect(svc.record({ metricName: 'x', value: 0 })).rejects.toThrow(
        'Failed to record metric',
      );
    });
  });

  describe('query', () => {
    it('returns all metrics with no filters', async () => {
      const pool = makePool([ok([metricRow])]);
      const svc = new MetricsService(pool);
      const result = await svc.query();
      expect(result[0]?.metricName).toBe('api_requests');
    });

    it('returns empty array when no metrics', async () => {
      const pool = makePool([ok([])]);
      const svc = new MetricsService(pool);
      const result = await svc.query({ metricName: 'missing' });
      expect(result).toHaveLength(0);
    });

    it('passes metricName, since, and limit filters', async () => {
      const pool = makePool([ok([])]);
      const svc = new MetricsService(pool);
      const since = new Date('2024-01-01');
      await svc.query({ metricName: 'api_requests', since, limit: 10 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[0]?.[1] ?? []) as unknown[];
      expect(params).toContain('api_requests');
      expect(params).toContain(since.toISOString());
      expect(params).toContain(10);
    });
  });
});
