import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentInsightService } from '../insights/AgentInsightService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000002';
const INSIGHT_ID = '00000000-0000-0000-0000-000000000003';

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

function makeInsightRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: INSIGHT_ID,
    organization_id: ORG_ID,
    agent_id: AGENT_ID,
    insight_type: 'pattern',
    title: 'Repetitive approval delays',
    description: 'Approval requests from HR take longer than average.',
    confidence: 0.85,
    data: { avgDelayDays: 5 },
    applied_at: null,
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('AgentInsightService', () => {
  describe('recordInsight', () => {
    it('inserts and returns an insight', async () => {
      const row = makeInsightRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentInsightService(pool);
      const insight = await svc.recordInsight(
        ORG_ID,
        AGENT_ID,
        'pattern',
        'Repetitive approval delays',
        'Approval requests from HR take longer than average.',
        0.85,
        { avgDelayDays: 5 },
      );

      expect(insight.id).toBe(INSIGHT_ID);
      expect(insight.agentId).toBe(AGENT_ID);
      expect(insight.confidence).toBe(0.85);
      expect(insight.appliedAt).toBeUndefined();

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[1]?.[0]).toContain('INSERT');
      expect((calls[1]?.[1] ?? [])[0]).toBe(ORG_ID);
      expect((calls[1]?.[1] ?? [])[1]).toBe(AGENT_ID);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentInsightService(pool);
      await expect(
        svc.recordInsight(ORG_ID, AGENT_ID, 'pattern', 'title', 'desc', 0.9, {}),
      ).rejects.toThrow('INSERT INTO agent_insights returned no row');
    });

    it('maps appliedAt when present', async () => {
      const row = makeInsightRow({ applied_at: new Date('2026-03-01') });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentInsightService(pool);
      const insight = await svc.recordInsight(ORG_ID, AGENT_ID, 'x', 't', 'd', 0.5, {});
      expect(insight.appliedAt).toBeInstanceOf(Date);
    });
  });

  describe('getInsights', () => {
    it('returns insights for org without agentId filter', async () => {
      const row = makeInsightRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentInsightService(pool);
      const insights = await svc.getInsights(ORG_ID);

      expect(insights).toHaveLength(1);
      expect(insights[0]?.id).toBe(INSIGHT_ID);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      // Query should only have $1 and $2 (orgId + limit), no agent filter
      expect((calls[1]?.[1] ?? []).length).toBe(2);
    });

    it('adds agent_id filter when agentId provided', async () => {
      const row = makeInsightRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentInsightService(pool);
      await svc.getInsights(ORG_ID, AGENT_ID);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      // Params: orgId, agentId, limit
      expect((calls[1]?.[1] ?? []).length).toBe(3);
      expect((calls[1]?.[1] ?? [])[1]).toBe(AGENT_ID);
    });

    it('passes custom limit', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentInsightService(pool);
      await svc.getInsights(ORG_ID, undefined, 5);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1]?.[1] ?? []) as unknown[];
      expect(params[params.length - 1]).toBe(5);
    });
  });

  describe('applyInsight', () => {
    it('sets applied_at and returns insight', async () => {
      const row = makeInsightRow({ applied_at: new Date('2026-04-01') });
      const pool = makePool([ok([]), ok([row])]);
      const svc = new AgentInsightService(pool);
      const insight = await svc.applyInsight(ORG_ID, INSIGHT_ID);

      expect(insight.appliedAt).toBeInstanceOf(Date);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[1]?.[0]).toContain('applied_at');
      expect((calls[1]?.[1] ?? [])[1]).toBe(INSIGHT_ID);
    });

    it('throws when insight not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentInsightService(pool);
      await expect(svc.applyInsight(ORG_ID, INSIGHT_ID)).rejects.toThrow(
        `AgentInsight not found: ${INSIGHT_ID}`,
      );
    });
  });
});
