import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HealthMonitorService } from '../monitoring/HealthMonitorService.js';

const ORG = '00000000-0000-0000-0000-000000000002';

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

const makeScoreRow = (score: number, dimension: string, status: string) => ({
  id: `hs-${dimension}`,
  organization_id: ORG,
  dimension,
  score,
  status,
  indicators: {},
  recommendations: [] as string[],
  measured_at: new Date('2024-06-01'),
});

describe('HealthMonitorService.computeOverallHealth', () => {
  it('averages non-overall dimension scores and records overall', async () => {
    const dimensionRows = [
      makeScoreRow(80, 'communication', 'healthy'),
      makeScoreRow(60, 'team', 'at_risk'),
    ];
    const overallRow = makeScoreRow(70, 'overall', 'healthy');

    // getAllLatestScores: setTenant (call 0) + SELECT (call 1)
    // recordScore: setTenant (call 2) + INSERT (call 3)
    const pool = makePool([ok([]), ok(dimensionRows), ok([]), ok([overallRow])]);
    const svc = new HealthMonitorService(pool);
    const result = await svc.computeOverallHealth(ORG);
    expect(result.dimension).toBe('overall');
    // avg of 80+60 = 70
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    // recordScore insert should include 70 as the score
    expect(calls[3]?.[1]).toContain(70);
  });

  it('uses score 50 when no dimension scores available', async () => {
    const overallRow = makeScoreRow(50, 'overall', 'at_risk');
    // getAllLatestScores: setTenant + SELECT (empty)
    // recordScore: setTenant + INSERT
    const pool = makePool([ok([]), ok([]), ok([]), ok([overallRow])]);
    const svc = new HealthMonitorService(pool);
    const result = await svc.computeOverallHealth(ORG);
    expect(result.score).toBe(50);
  });

  it('excludes overall dimension from average', async () => {
    const rows = [
      makeScoreRow(80, 'communication', 'healthy'),
      makeScoreRow(60, 'overall', 'at_risk'), // should be excluded
    ];
    const overallRow = makeScoreRow(80, 'overall', 'healthy');
    const pool = makePool([ok([]), ok(rows), ok([]), ok([overallRow])]);
    const svc = new HealthMonitorService(pool);
    await svc.computeOverallHealth(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    // Only communication (80) is included, avg = 80
    expect(calls[3]?.[1]).toContain(80);
  });
});

describe('HealthMonitorService.flagAtRisk', () => {
  it('returns only at_risk and critical scores', async () => {
    const rows = [
      makeScoreRow(80, 'communication', 'healthy'),
      makeScoreRow(55, 'team', 'at_risk'),
      makeScoreRow(20, 'workflow', 'critical'),
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new HealthMonitorService(pool);
    const result = await svc.flagAtRisk(ORG);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.dimension)).toContain('team');
    expect(result.map((s) => s.dimension)).toContain('workflow');
  });

  it('returns empty array when all scores are healthy', async () => {
    const rows = [makeScoreRow(90, 'communication', 'healthy')];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new HealthMonitorService(pool);
    const result = await svc.flagAtRisk(ORG);
    expect(result).toHaveLength(0);
  });
});
