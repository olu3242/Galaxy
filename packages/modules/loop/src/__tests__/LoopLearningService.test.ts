/**
 * Loop OS — Learning Phase unit tests
 *
 * Covers LoopLearningService:
 *   analyzePatterns → generateInsights → listInsights
 *
 * All DB calls are mocked via a pool stub; no real database required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { LoopLearningService } from '../services/LoopLearningService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const NOW = '2026-01-01T00:00:00.000Z';

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

// ─── analyzePatterns ────────────────────────────────────────────────────────

describe('LoopLearningService.analyzePatterns', () => {
  it('returns empty array when no loop instances exist', async () => {
    const pool = makePool([ok([]), ok([])]); // set_config + SELECT
    const svc = new LoopLearningService(pool);
    const result = await svc.analyzePatterns(ORG);
    expect(result).toEqual([]);
  });

  it('maps aggregate rows to WorkflowPattern correctly', async () => {
    const aggRow = {
      workflow_type: 'leave_request',
      avg_score: '3.8',
      total: '20',
      completed: '16',
      escalated: '2',
      avg_verifications: '1.5',
    };
    const pool = makePool([ok([]), ok([aggRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.analyzePatterns(ORG);
    expect(result).toMatchObject([
      {
        workflowType: 'leave_request',
        avgFeedbackScore: 3.8,
        completionRate: 0.8,
        avgVerificationCount: 1.5,
        escalationRate: 0.1,
        sampleSize: 20,
      },
    ]);
  });

  it('handles null workflow_type as "unknown"', async () => {
    const aggRow = {
      workflow_type: null,
      avg_score: null,
      total: '5',
      completed: '5',
      escalated: '0',
      avg_verifications: null,
    };
    const pool = makePool([ok([]), ok([aggRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.analyzePatterns(ORG);
    expect(result).toMatchObject([
      {
        workflowType: 'unknown',
        avgFeedbackScore: 0,
        avgVerificationCount: 0,
      },
    ]);
  });

  it('computes zero rates safely when total is 0', async () => {
    const aggRow = {
      workflow_type: 'expense',
      avg_score: '0',
      total: '0',
      completed: '0',
      escalated: '0',
      avg_verifications: '0',
    };
    const pool = makePool([ok([]), ok([aggRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.analyzePatterns(ORG);
    expect(result).toMatchObject([{ completionRate: 0, escalationRate: 0 }]);
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopLearningService(pool);
    await svc.analyzePatterns(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });
});

// ─── generateInsights ────────────────────────────────────────────────────────

describe('LoopLearningService.generateInsights', () => {
  it('returns empty array when no patterns qualify (sample too small)', async () => {
    const aggRow = {
      workflow_type: 'leave_request',
      avg_score: '1.0',
      total: '2', // < 3, below threshold
      completed: '0',
      escalated: '2',
      avg_verifications: '5',
    };
    const pool = makePool([ok([]), ok([aggRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toEqual([]);
  });

  it('generates low_feedback insight for score below 2.5', async () => {
    const aggRow = {
      workflow_type: 'leave_request',
      avg_score: '2.1',
      total: '10',
      completed: '7',
      escalated: '1',
      avg_verifications: '1',
    };
    const insightRow = {
      id: 'ins-1',
      organization_id: ORG,
      workflow_type: 'leave_request',
      insight_type: 'low_feedback',
      severity: 'warning',
      summary: 'leave_request workflows averaging 2.1/5 feedback',
      data_points: { avgFeedbackScore: 2.1, sampleSize: 10 },
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([
      {
        insightType: 'low_feedback',
        severity: 'warning',
        workflowType: 'leave_request',
      },
    ]);
  });

  it('marks low_feedback critical when score is below 2.0', async () => {
    const aggRow = {
      workflow_type: 'expense',
      avg_score: '1.5',
      total: '10',
      completed: '5',
      escalated: '1',
      avg_verifications: '1',
    };
    const insightRow = {
      id: 'ins-2',
      organization_id: ORG,
      workflow_type: 'expense',
      insight_type: 'low_feedback',
      severity: 'critical',
      summary: 'expense workflows averaging 1.5/5 feedback',
      data_points: {},
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([{ severity: 'critical' }]);
  });

  it('generates high_escalation insight when escalation rate > 0.3', async () => {
    const aggRow = {
      workflow_type: 'incident',
      avg_score: '3.5',
      total: '10',
      completed: '4',
      escalated: '4', // 40% — above threshold
      avg_verifications: '2',
    };
    const insightRow = {
      id: 'ins-3',
      organization_id: ORG,
      workflow_type: 'incident',
      insight_type: 'high_escalation',
      severity: 'warning',
      summary: '40% of incident workflows are escalating',
      data_points: {},
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([{ insightType: 'high_escalation' }]);
  });

  it('marks high_escalation critical when rate > 0.5', async () => {
    const aggRow = {
      workflow_type: 'incident',
      avg_score: '3.0',
      total: '10',
      completed: '4',
      escalated: '6', // 60% — critical
      avg_verifications: '2',
    };
    const insightRow = {
      id: 'ins-4',
      organization_id: ORG,
      workflow_type: 'incident',
      insight_type: 'high_escalation',
      severity: 'critical',
      summary: '60% of incident workflows are escalating',
      data_points: {},
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([{ severity: 'critical' }]);
  });

  it('generates verification_bottleneck when avg verifications > 3', async () => {
    const aggRow = {
      workflow_type: 'procurement',
      avg_score: '3.5',
      total: '8',
      completed: '6',
      escalated: '1',
      avg_verifications: '4.2',
    };
    const insightRow = {
      id: 'ins-5',
      organization_id: ORG,
      workflow_type: 'procurement',
      insight_type: 'verification_bottleneck',
      severity: 'warning',
      summary: 'procurement requires avg 4.2 verifications',
      data_points: {},
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([{ insightType: 'verification_bottleneck', severity: 'warning' }]);
  });

  it('generates positive_pattern for high-performing workflows', async () => {
    const aggRow = {
      workflow_type: 'onboarding',
      avg_score: '4.5',
      total: '20',
      completed: '19', // 95% completion
      escalated: '0',
      avg_verifications: '1.0',
    };
    const insightRow = {
      id: 'ins-6',
      organization_id: ORG,
      workflow_type: 'onboarding',
      insight_type: 'positive_pattern',
      severity: 'info',
      summary: 'onboarding is performing well: 95% completion',
      data_points: {},
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([{ insightType: 'positive_pattern', severity: 'info' }]);
  });

  it('maps saved insight rows back to LoopInsight domain objects', async () => {
    const aggRow = {
      workflow_type: 'leave_request',
      avg_score: '1.8',
      total: '5',
      completed: '3',
      escalated: '1',
      avg_verifications: '1',
    };
    const insightRow = {
      id: 'ins-7',
      organization_id: ORG,
      workflow_type: 'leave_request',
      insight_type: 'low_feedback',
      severity: 'critical',
      summary: 'Low feedback',
      data_points: { avgFeedbackScore: 1.8, sampleSize: 5 },
      generated_at: NOW,
    };
    const pool = makePool([ok([]), ok([aggRow]), ok([]), ok([insightRow])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.generateInsights(ORG);
    expect(result).toMatchObject([
      {
        id: 'ins-7',
        organizationId: ORG,
        workflowType: 'leave_request',
        insightType: 'low_feedback',
        severity: 'critical',
        generatedAt: NOW,
      },
    ]);
  });
});

// ─── listInsights ────────────────────────────────────────────────────────────

describe('LoopLearningService.listInsights', () => {
  it('returns insights ordered by recency', async () => {
    const rows = [
      {
        id: 'ins-a',
        organization_id: ORG,
        workflow_type: 'leave_request',
        insight_type: 'low_feedback',
        severity: 'warning',
        summary: 'A',
        data_points: {},
        generated_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'ins-b',
        organization_id: ORG,
        workflow_type: 'expense',
        insight_type: 'high_escalation',
        severity: 'critical',
        summary: 'B',
        data_points: {},
        generated_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new LoopLearningService(pool);
    const result = await svc.listInsights(ORG);
    expect(result).toHaveLength(2);
    expect(result).toMatchObject([{ id: 'ins-a' }, { id: 'ins-b' }]);
  });

  it('defaults to limit 20 and passes it to the query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopLearningService(pool);
    await svc.listInsights(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const selectParams = calls[1]?.[1] ?? [];
    expect(selectParams[1]).toBe(20);
  });

  it('respects a custom limit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopLearningService(pool);
    await svc.listInsights(ORG, 5);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const selectParams = calls[1]?.[1] ?? [];
    expect(selectParams[1]).toBe(5);
  });

  it('returns empty array when no insights exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new LoopLearningService(pool);
    const result = await svc.listInsights(ORG);
    expect(result).toEqual([]);
  });
});
