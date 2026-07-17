import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PeerMatchingService } from '../PeerMatchingService.js';

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

describe('PeerMatchingService', () => {
  describe('getPeerComparison', () => {
    it('returns empty when org has no contributions', async () => {
      // setTenantContext + myContribs (empty) + benchmarks
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new PeerMatchingService(pool);
      const result = await svc.getPeerComparison('org-1', 'tech', 'small', '2024-01');
      expect(result).toHaveLength(0);
    });

    it('computes percentile rank from contributions and benchmarks', async () => {
      const contribs = [{ metric_key: 'workflow_completion_rate', metric_value: '0.75' }];
      const benchmarks = [
        { metric_key: 'workflow_completion_rate', p50: '0.75', p75: '0.9', cohort_size: '20' },
      ];
      // setTenantContext + myContribs + benchmarks
      const pool = makePool([ok([]), ok(contribs), ok(benchmarks)]);
      const svc = new PeerMatchingService(pool);
      const result = await svc.getPeerComparison('org-1', 'tech', 'small', '2024-01');
      expect(result).toHaveLength(1);
      expect(result[0]?.metricKey).toBe('workflow_completion_rate');
      expect(result[0]?.orgValue).toBe(0.75);
      expect(result[0]?.benchmarkP50).toBe(0.75);
      expect(result[0]?.benchmarkP75).toBe(0.9);
      // percentileRank = min(100, round(0.75/0.75 * 50)) = 50
      expect(result[0]?.percentileRank).toBe(50);
    });

    it('uses 0 for percentileRank when no benchmark available for metric', async () => {
      const contribs = [{ metric_key: 'unknown_metric', metric_value: '1.0' }];
      const pool = makePool([ok([]), ok(contribs), ok([])]);
      const svc = new PeerMatchingService(pool);
      const result = await svc.getPeerComparison('org-1', 'tech', 'small', '2024-01');
      expect(result[0]?.percentileRank).toBe(0);
    });

    it('caps percentileRank at 100', async () => {
      const contribs = [{ metric_key: 'metric', metric_value: '10.0' }];
      const benchmarks = [{ metric_key: 'metric', p50: '0.1', p75: '0.9', cohort_size: '20' }];
      const pool = makePool([ok([]), ok(contribs), ok(benchmarks)]);
      const svc = new PeerMatchingService(pool);
      const result = await svc.getPeerComparison('org-1', 'tech', 'small', '2024-01');
      expect(result[0]?.percentileRank).toBe(100);
    });

    it('uses current month when period not specified', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new PeerMatchingService(pool);
      await svc.getPeerComparison('org-1', 'tech', 'small');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const contribCall = calls[1];
      const params = (contribCall?.[1] ?? []) as unknown[];
      expect(typeof params[1]).toBe('string');
      expect((params[1] as string).length).toBe(7); // YYYY-MM
    });
  });

  describe('getRecommendations', () => {
    it('returns recommendations only for metrics below 50th percentile', async () => {
      const contribs = [
        { metric_key: 'metric_low', metric_value: '0.3' },
        { metric_key: 'metric_high', metric_value: '0.9' },
      ];
      const benchmarks = [
        { metric_key: 'metric_low', p50: '0.75', p75: '0.9', cohort_size: '20' },
        { metric_key: 'metric_high', p50: '0.75', p75: '0.9', cohort_size: '20' },
      ];
      const pool = makePool([ok([]), ok(contribs), ok(benchmarks)]);
      const svc = new PeerMatchingService(pool);
      const recs = await svc.getRecommendations('org-1', 'tech', 'small');
      // metric_low: orgValue=0.3, p50=0.75 → rank = min(100, round(0.3/0.75*50)) = 20 < 50
      // metric_high: orgValue=0.9, p50=0.75 → rank = 60 >= 50
      expect(recs.some((r) => r.metricKey === 'metric_low')).toBe(true);
      expect(recs.some((r) => r.metricKey === 'metric_high')).toBe(false);
    });

    it('includes improvement percentage and recommendation text', async () => {
      const contribs = [{ metric_key: 'metric', metric_value: '0.5' }];
      const benchmarks = [{ metric_key: 'metric', p50: '0.75', p75: '1.0', cohort_size: '20' }];
      const pool = makePool([ok([]), ok(contribs), ok(benchmarks)]);
      const svc = new PeerMatchingService(pool);
      const recs = await svc.getRecommendations('org-1', 'tech', 'small');
      expect(recs).toHaveLength(1);
      expect(recs[0]?.currentValue).toBe(0.5);
      expect(recs[0]?.targetValue).toBe(1.0);
      expect(recs[0]?.improvementPct).toBe(100);
      expect(recs[0]?.recommendation).toContain('metric');
    });

    it('returns empty when no contributions below 50th percentile', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new PeerMatchingService(pool);
      const recs = await svc.getRecommendations('org-1', 'tech', 'small');
      expect(recs).toHaveLength(0);
    });
  });
});
