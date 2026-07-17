import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { IndustryBenchmarkService } from '../IndustryBenchmarkService.js';

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

const ORG = 'org-abc';
const INDUSTRY = 'fintech';
const SIZE = 'mid';
const PERIOD = '2026-07';

describe('IndustryBenchmarkService', () => {
  describe('getOrgPercentile', () => {
    it('sets tenant context before querying', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new IndustryBenchmarkService(pool);
      await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns empty array when no contributions', async () => {
      // set_config, contribs (empty), benchmarks
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result).toEqual([]);
    });

    it('maps percentile to 90 when value >= p90', async () => {
      const contribRows = [{ metric_key: 'sla_score', metric_value: '95' }];
      const benchmarkRows = [
        { metric_key: 'sla_score', p25: '50', p50: '70', p75: '80', p90: '90' },
      ];
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result).toHaveLength(1);
      expect(result[0]?.percentile).toBe(90);
      expect(result[0]?.value).toBe(95);
    });

    it('maps percentile to 75 when value >= p75 but < p90', async () => {
      const contribRows = [{ metric_key: 'sla_score', metric_value: '82' }];
      const benchmarkRows = [
        { metric_key: 'sla_score', p25: '50', p50: '70', p75: '80', p90: '90' },
      ];
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result[0]?.percentile).toBe(75);
    });

    it('maps percentile to 50 when value >= p50 but < p75', async () => {
      const contribRows = [{ metric_key: 'sla_score', metric_value: '72' }];
      const benchmarkRows = [
        { metric_key: 'sla_score', p25: '50', p50: '70', p75: '80', p90: '90' },
      ];
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result[0]?.percentile).toBe(50);
    });

    it('maps percentile to 25 when value >= p25 but < p50', async () => {
      const contribRows = [{ metric_key: 'sla_score', metric_value: '55' }];
      const benchmarkRows = [
        { metric_key: 'sla_score', p25: '50', p50: '70', p75: '80', p90: '90' },
      ];
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result[0]?.percentile).toBe(25);
    });

    it('maps percentile to 10 when value < p25', async () => {
      const contribRows = [{ metric_key: 'sla_score', metric_value: '30' }];
      const benchmarkRows = [
        { metric_key: 'sla_score', p25: '50', p50: '70', p75: '80', p90: '90' },
      ];
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result[0]?.percentile).toBe(10);
    });

    it('defaults percentile to 50 when no matching benchmark', async () => {
      const contribRows = [{ metric_key: 'unknown_metric', metric_value: '42' }];
      const pool = makePool([ok([]), ok(contribRows), ok([])]);
      const svc = new IndustryBenchmarkService(pool);
      const result = await svc.getOrgPercentile(ORG, INDUSTRY, SIZE, PERIOD);
      expect(result[0]?.percentile).toBe(50);
    });

    it('uses current month as default period', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new IndustryBenchmarkService(pool);
      await svc.getOrgPercentile(ORG, INDUSTRY, SIZE);
      const calls = vi.mocked(pool.query).mock.calls;
      const contribCall = calls[1];
      const expectedPeriod = new Date().toISOString().slice(0, 7);
      expect((contribCall?.[1] ?? [])[1]).toBe(expectedPeriod);
    });
  });

  describe('getIndustryReport', () => {
    it('returns a report with parsed metrics', async () => {
      const benchmarkRows = [
        { metric_key: 'sla_score', p25: '40', p50: '60', p75: '80', p90: '90', cohort_size: '100' },
      ];
      const pool = makePool([ok(benchmarkRows)]);
      const svc = new IndustryBenchmarkService(pool);
      const report = await svc.getIndustryReport(INDUSTRY, SIZE, PERIOD);
      expect(report.industry).toBe(INDUSTRY);
      expect(report.sizeBucket).toBe(SIZE);
      expect(report.period).toBe(PERIOD);
      expect(report.metrics).toHaveLength(1);
      expect(report.metrics[0]?.p25).toBe(40);
      expect(report.metrics[0]?.cohortSize).toBe(100);
    });

    it('returns empty metrics when no benchmarks exist', async () => {
      const pool = makePool([ok([])]);
      const svc = new IndustryBenchmarkService(pool);
      const report = await svc.getIndustryReport(INDUSTRY, SIZE, PERIOD);
      expect(report.metrics).toEqual([]);
    });
  });
});
