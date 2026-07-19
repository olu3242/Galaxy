import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WorkloadForecastService } from '../WorkloadForecastService.js';

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

const ORG = 'org-forecast';

describe('WorkloadForecastService', () => {
  describe('forecast', () => {
    it('sets tenant context before querying', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WorkloadForecastService(pool);
      await svc.forecast(ORG, 'hr');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns 0 forecastedVolume and low confidence when no data', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WorkloadForecastService(pool);
      const result = await svc.forecast(ORG, 'finance');
      expect(result.forecastedVolume).toBe(0);
      expect(result.confidence).toBe(0.4);
      expect(result.historicalAvg).toBe(0);
      expect(result.seasonalityFactor).toBe(1.0);
    });

    it('returns high confidence when >= 7 rows of data', async () => {
      const rows = Array.from({ length: 7 }, (_, i) => ({
        day_of_week: String(i),
        avg_count: '10',
      }));
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new WorkloadForecastService(pool);
      const result = await svc.forecast(ORG, 'ops');
      expect(result.confidence).toBe(0.8);
    });

    it('applies seasonality factor for current day of week', async () => {
      const currentDow = new Date().getDay().toString();
      // Make today's avg double the overall avg
      const rows = [
        { day_of_week: currentDow, avg_count: '20' },
        { day_of_week: '9', avg_count: '10' }, // fake other day
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new WorkloadForecastService(pool);
      const result = await svc.forecast(ORG, 'ops');
      // totalAvg = (20 + 10) / 2 = 15, seasonality = 20/15 ≈ 1.33, forecasted = round(15 * 1.33) = 20
      expect(result.seasonalityFactor).toBeCloseTo(1.33, 1);
      expect(result.forecastedVolume).toBe(20);
    });

    it('returns correct domain and organizationId', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WorkloadForecastService(pool);
      const result = await svc.forecast(ORG, 'supply-chain');
      expect(result.domain).toBe('supply-chain');
      expect(result.organizationId).toBe(ORG);
    });

    it('returns today as period', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WorkloadForecastService(pool);
      const result = await svc.forecast(ORG, 'ops');
      const expectedDate = new Date().toISOString().slice(0, 10);
      expect(result.period).toBe(expectedDate);
    });
  });
});
