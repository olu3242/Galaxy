import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { BenchmarkService } from '../BenchmarkService.js';

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

const baseBenchmarkRow = {
  id: 'bench-1',
  industry: 'tech',
  size_bucket: 'small',
  metric_key: 'workflow_completion_rate',
  p25: '0.6',
  p50: '0.75',
  p75: '0.9',
  p90: '0.95',
  cohort_size: '15',
  period: '2024-01',
  created_at: '2024-01-01T00:00:00Z',
};

describe('BenchmarkService', () => {
  describe('aggregateBenchmarks', () => {
    it('returns empty when no aggregate rows returned', async () => {
      const pool = makePool([ok([])]);
      const svc = new BenchmarkService(pool);
      const result = await svc.aggregateBenchmarks('tech', 'small', '2024-01');
      expect(result).toHaveLength(0);
    });

    it('upserts one benchmark per aggregate row', async () => {
      const aggregateRow = {
        metric_key: 'workflow_completion_rate',
        count: '15',
        p25: '0.6',
        p50: '0.75',
        p75: '0.9',
        p90: '0.95',
      };
      const pool = makePool([ok([aggregateRow]), ok([baseBenchmarkRow])]);
      const svc = new BenchmarkService(pool);
      const result = await svc.aggregateBenchmarks('tech', 'small', '2024-01');
      expect(result).toHaveLength(1);
      expect(result[0]?.metricKey).toBe('workflow_completion_rate');
      expect(result[0]?.p50).toBe(0.75);
      expect(result[0]?.cohortSize).toBe(15);
    });

    it('processes multiple aggregate rows', async () => {
      const agg1 = {
        metric_key: 'metric_a',
        count: '12',
        p25: '1',
        p50: '2',
        p75: '3',
        p90: '4',
      };
      const agg2 = {
        metric_key: 'metric_b',
        count: '20',
        p25: '5',
        p50: '6',
        p75: '7',
        p90: '8',
      };
      const row1 = { ...baseBenchmarkRow, metric_key: 'metric_a', id: 'bench-a' };
      const row2 = { ...baseBenchmarkRow, metric_key: 'metric_b', id: 'bench-b' };
      const pool = makePool([ok([agg1, agg2]), ok([row1]), ok([row2])]);
      const svc = new BenchmarkService(pool);
      const result = await svc.aggregateBenchmarks('tech', 'small', '2024-01');
      expect(result).toHaveLength(2);
    });
  });

  describe('getBenchmarks', () => {
    it('returns benchmarks for given period', async () => {
      const pool = makePool([ok([baseBenchmarkRow])]);
      const svc = new BenchmarkService(pool);
      const result = await svc.getBenchmarks('tech', 'small', '2024-01');
      expect(result).toHaveLength(1);
      expect(result[0]?.industry).toBe('tech');
      expect(result[0]?.p25).toBe(0.6);
      expect(result[0]?.p90).toBe(0.95);
    });

    it('returns empty when no benchmarks found', async () => {
      const pool = makePool([ok([])]);
      const svc = new BenchmarkService(pool);
      const result = await svc.getBenchmarks('tech', 'small', '2024-01');
      expect(result).toHaveLength(0);
    });

    it('uses current month when period not specified', async () => {
      const pool = makePool([ok([])]);
      const svc = new BenchmarkService(pool);
      await svc.getBenchmarks('tech', 'small');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const firstCall = calls[0];
      const params = (firstCall?.[1] ?? []) as unknown[];
      // period param is index 2
      expect(typeof params[2]).toBe('string');
      expect((params[2] as string).length).toBe(7); // YYYY-MM format
    });
  });
});
