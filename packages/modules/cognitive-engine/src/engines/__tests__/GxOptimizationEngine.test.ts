import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GxOptimizationEngine } from '../GxOptimizationEngine.js';

const ORG = '00000000-0000-0000-0000-000000000004';
const AGENT = 'agent-opt-001';

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

describe('GxOptimizationEngine.detectBottlenecks', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxOptimizationEngine(pool);
    await engine.detectBottlenecks(AGENT, ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns score of 1.0 when no bottlenecks', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxOptimizationEngine(pool);
    const report = await engine.detectBottlenecks(AGENT, ORG);
    expect(report.optimizationScore).toBe(1.0);
    expect(report.bottlenecks).toHaveLength(0);
  });

  it('maps bottleneck rows with correct severity (high)', async () => {
    const rows = [{ intent: 'slow_op', avg_ms: '20000', count: '5', fail_rate: '0.6' }];
    const pool = makePool([ok([]), ok(rows)]);
    const engine = new GxOptimizationEngine(pool);
    const report = await engine.detectBottlenecks(AGENT, ORG);
    expect(report.bottlenecks).toHaveLength(1);
    const b = report.bottlenecks[0];
    expect(b?.severity).toBe('high');
    expect(b?.area).toBe('slow_op');
  });

  it('maps bottleneck rows with medium severity', async () => {
    const rows = [{ intent: 'mid_op', avg_ms: '9000', count: '3', fail_rate: '0.2' }];
    const pool = makePool([ok([]), ok(rows)]);
    const engine = new GxOptimizationEngine(pool);
    const report = await engine.detectBottlenecks(AGENT, ORG);
    const b = report.bottlenecks[0];
    expect(b?.severity).toBe('medium');
  });

  it('includes agentId and organizationId in report', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxOptimizationEngine(pool);
    const report = await engine.detectBottlenecks(AGENT, ORG);
    expect(report.agentId).toBe(AGENT);
    expect(report.organizationId).toBe(ORG);
  });
});

describe('GxOptimizationEngine.improveRouting', () => {
  it('sets tenant context and upserts routing rule', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxOptimizationEngine(pool);
    await engine.improveRouting(ORG, 'query_information', { agentId: 'agent-fast' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('INSERT INTO optimization_routing_overrides');
  });
});
