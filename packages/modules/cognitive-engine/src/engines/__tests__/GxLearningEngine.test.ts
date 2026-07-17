import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GxLearningEngine } from '../GxLearningEngine.js';
import type { LearningEvent, LearningInsight } from '../GxLearningEngine.js';

const ORG = '00000000-0000-0000-0000-000000000003';
const AGENT = 'agent-learn-001';

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

const sampleEvent: LearningEvent = {
  agentId: AGENT,
  organizationId: ORG,
  executionId: 'exec-1',
  outcome: 'success',
  intent: 'query_information',
  actions: ['fetch_data'],
  durationMs: 120,
  confidenceScore: 0.9,
  humanEscalated: false,
};

describe('GxLearningEngine.recordOutcome', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxLearningEngine(pool);
    await engine.recordOutcome(sampleEvent);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('issues INSERT with correct intent', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxLearningEngine(pool);
    await engine.recordOutcome(sampleEvent);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const insertQuery = calls[1]?.[0];
    expect(insertQuery).toContain('INSERT INTO agent_learning_events');
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain('query_information');
  });

  it('passes null for missing errorMessage', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxLearningEngine(pool);
    const { errorMessage: _unused, ...eventWithoutError } = sampleEvent;
    await engine.recordOutcome(eventWithoutError);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain(null);
  });
});

describe('GxLearningEngine.generateInsights', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxLearningEngine(pool);
    await engine.generateInsights(AGENT, ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('maps rows to LearningInsight with correct successRate', async () => {
    const rows = [
      {
        intent: 'query_information',
        frequency: '10',
        avg_confidence: '0.85',
        success_rate: '0.95',
      },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const engine = new GxLearningEngine(pool);
    const insights = await engine.generateInsights(AGENT, ORG);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.pattern).toBe('query_information');
    expect(insights[0]?.successRate).toBeCloseTo(0.95);
    expect(insights[0]?.recommendation).toContain('auto-approve');
  });

  it('returns empty array when no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxLearningEngine(pool);
    const insights = await engine.generateInsights(AGENT, ORG);
    expect(insights).toHaveLength(0);
  });

  it('includes low success rate recommendation when successRate < 0.6', async () => {
    const rows = [
      { intent: 'trigger_workflow', frequency: '5', avg_confidence: '0.5', success_rate: '0.4' },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const engine = new GxLearningEngine(pool);
    const insights = await engine.generateInsights(AGENT, ORG);
    expect(insights[0]?.recommendation).toContain('low success rate');
  });
});

describe('GxLearningEngine.updateMemoryFromLearning', () => {
  it('sets tenant context then upserts memory', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxLearningEngine(pool);
    const insight: LearningInsight = {
      agentId: AGENT,
      organizationId: ORG,
      pattern: 'query_information',
      frequency: 10,
      avgConfidence: 0.85,
      successRate: 0.9,
      recommendation: 'auto-approve',
      generatedAt: '2026-01-01T00:00:00Z',
    };
    await engine.updateMemoryFromLearning(AGENT, ORG, insight, pool);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('INSERT INTO agent_memories');
  });
});
