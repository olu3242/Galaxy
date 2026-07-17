import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HealthScoringService } from '../scoring/HealthScoringService.js';

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

const makeRow = (score: number, dimension = 'communication', status = 'healthy') => ({
  id: 'hs-1',
  organization_id: ORG,
  dimension,
  score,
  status,
  indicators: {},
  recommendations: ['Do more standups'],
  measured_at: new Date('2024-06-01'),
});

describe('HealthScoringService.recordScore', () => {
  it('sets tenant context and inserts score with computed status', async () => {
    const row = makeRow(80);
    const pool = makePool([ok([]), ok([row])]);
    const svc = new HealthScoringService(pool);
    const result = await svc.recordScore(ORG, 'communication', 80, {}, ['Do more standups']);
    expect(result.score).toBe(80);
    expect(result.dimension).toBe('communication');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    // status should be 'healthy' for score 80
    expect(calls[1]?.[1]).toContain('healthy');
  });

  it('assigns at_risk status for score 55', async () => {
    const row = makeRow(55, 'team', 'at_risk');
    const pool = makePool([ok([]), ok([row])]);
    const svc = new HealthScoringService(pool);
    await svc.recordScore(ORG, 'team', 55, {}, []);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain('at_risk');
  });

  it('assigns critical status for score 30', async () => {
    const row = makeRow(30, 'workflow', 'critical');
    const pool = makePool([ok([]), ok([row])]);
    const svc = new HealthScoringService(pool);
    await svc.recordScore(ORG, 'workflow', 30, {}, []);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain('critical');
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new HealthScoringService(pool);
    await expect(svc.recordScore(ORG, 'communication', 80, {}, [])).rejects.toThrow(
      'Failed to record health score',
    );
  });
});

describe('HealthScoringService.getLatestScore', () => {
  it('returns mapped score when found', async () => {
    const row = makeRow(75);
    const pool = makePool([ok([]), ok([row])]);
    const svc = new HealthScoringService(pool);
    const result = await svc.getLatestScore(ORG, 'communication');
    expect(result?.score).toBe(75);
    expect(result?.recommendations).toEqual(['Do more standups']);
  });

  it('returns null when no score found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new HealthScoringService(pool);
    const result = await svc.getLatestScore(ORG, 'communication');
    expect(result).toBeNull();
  });
});

describe('HealthScoringService.getAllLatestScores', () => {
  it('returns all latest scores for org', async () => {
    const rows = [makeRow(80, 'communication'), makeRow(60, 'team', 'at_risk')];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new HealthScoringService(pool);
    const results = await svc.getAllLatestScores(ORG);
    expect(results).toHaveLength(2);
  });
});

describe('HealthScoringService.getTrend', () => {
  it('returns improving trend when last score much higher than first', async () => {
    const rows = [
      { score: 40, measured_at: new Date('2024-01-01') },
      { score: 75, measured_at: new Date('2024-01-30') },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new HealthScoringService(pool);
    const trend = await svc.getTrend(ORG, 'communication');
    expect(trend.trend).toBe('improving');
    expect(trend.scores).toHaveLength(2);
  });

  it('returns declining trend when last score much lower than first', async () => {
    const rows = [
      { score: 80, measured_at: new Date('2024-01-01') },
      { score: 40, measured_at: new Date('2024-01-30') },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new HealthScoringService(pool);
    const trend = await svc.getTrend(ORG, 'workflow');
    expect(trend.trend).toBe('declining');
  });

  it('returns stable trend when scores are close', async () => {
    const rows = [
      { score: 70, measured_at: new Date('2024-01-01') },
      { score: 72, measured_at: new Date('2024-01-30') },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new HealthScoringService(pool);
    const trend = await svc.getTrend(ORG, 'team');
    expect(trend.trend).toBe('stable');
  });

  it('returns stable trend when no scores', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new HealthScoringService(pool);
    const trend = await svc.getTrend(ORG, 'knowledge');
    expect(trend.trend).toBe('stable');
    expect(trend.scores).toHaveLength(0);
  });
});
