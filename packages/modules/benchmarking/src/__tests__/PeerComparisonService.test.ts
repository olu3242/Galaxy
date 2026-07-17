import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PeerComparisonService } from '../PeerComparisonService.js';

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

const ORG = 'org-xyz';
const INDUSTRY = 'logistics';
const SIZE = 'small';
const PERIOD = '2026-06';

describe('PeerComparisonService', () => {
  describe('generateComparisonReport', () => {
    it('returns overallPercentile of 50 when no metrics', async () => {
      // set_config, contribs (empty), benchmarks (empty)
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new PeerComparisonService(pool);
      const report = await svc.generateComparisonReport(ORG, INDUSTRY, SIZE, PERIOD);
      expect(report.organizationId).toBe(ORG);
      expect(report.summary.overallPercentile).toBe(50);
      expect(report.summary.totalMetrics).toBe(0);
      expect(report.summary.metricsAboveMedian).toBe(0);
    });

    it('computes correct summary for multiple metrics', async () => {
      const contribRows = [
        { metric_key: 'sla', metric_value: '95' },
        { metric_key: 'throughput', metric_value: '30' },
      ];
      const benchmarkRows = [
        { metric_key: 'sla', p25: '50', p50: '70', p75: '80', p90: '90' },
        { metric_key: 'throughput', p25: '50', p50: '70', p75: '80', p90: '90' },
      ];
      // set_config, contribs, benchmarks
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new PeerComparisonService(pool);
      const report = await svc.generateComparisonReport(ORG, INDUSTRY, SIZE, PERIOD);
      // sla => 90, throughput => 10, avg => 50
      expect(report.summary.totalMetrics).toBe(2);
      expect(report.summary.metricsAboveMedian).toBe(1);
      expect(report.summary.overallPercentile).toBe(50);
    });

    it('sets organizationId and period correctly', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new PeerComparisonService(pool);
      const report = await svc.generateComparisonReport(ORG, INDUSTRY, SIZE, PERIOD);
      expect(report.organizationId).toBe(ORG);
      expect(report.period).toBe(PERIOD);
    });

    it('uses current month when period not specified', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new PeerComparisonService(pool);
      const report = await svc.generateComparisonReport(ORG, INDUSTRY, SIZE);
      const expectedPeriod = new Date().toISOString().slice(0, 7);
      expect(report.period).toBe(expectedPeriod);
    });

    it('percentiles array includes org-specific fields', async () => {
      const contribRows = [{ metric_key: 'sla', metric_value: '85' }];
      const benchmarkRows = [{ metric_key: 'sla', p25: '50', p50: '70', p75: '80', p90: '90' }];
      const pool = makePool([ok([]), ok(contribRows), ok(benchmarkRows)]);
      const svc = new PeerComparisonService(pool);
      const report = await svc.generateComparisonReport(ORG, INDUSTRY, SIZE, PERIOD);
      const firstPercentile = report.percentiles[0];
      expect(firstPercentile?.organizationId).toBe(ORG);
      expect(firstPercentile?.industry).toBe(INDUSTRY);
      expect(firstPercentile?.sizeBucket).toBe(SIZE);
    });
  });
});
