import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { RiskScoringEngine } from '../decisions/RiskScoringEngine.js';

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

const ORG = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000010';
const CORR_ID = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

const riskRow = {
  id: 'risk-1',
  organization_id: ORG,
  agent_id: AGENT_ID,
  execution_id: null,
  subject_type: 'action',
  subject_id: 'subj-1',
  risk_score: '15.00',
  risk_level: 'low',
  risk_factors: [],
  recommended_action: null,
  correlation_id: CORR_ID,
  created_at: NOW,
};

describe('RiskScoringEngine', () => {
  describe('computeFactors (pure)', () => {
    it('returns empty factors for a plain safe subject', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = engine.computeFactors({ description: 'routine task' });
      expect(factors).toHaveLength(0);
    });

    it('adds high_value factor for amount > 10000', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = engine.computeFactors({ amount: 20000 });
      const names = factors.map((f) => f.name);
      expect(names).toContain('high_value');
    });

    it('adds medium_value factor for amount between 2500 and 10000', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = engine.computeFactors({ amount: 5000 });
      const names = factors.map((f) => f.name);
      expect(names).toContain('medium_value');
    });

    it('adds sla_breached factor for past due date', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const factors = engine.computeFactors({ slaDueAt: past });
      const names = factors.map((f) => f.name);
      expect(names).toContain('sla_breached');
    });

    it('adds sla_critical factor for SLA < 4h away', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const soon = new Date(Date.now() + 2 * 3_600_000).toISOString();
      const factors = engine.computeFactors({ slaDueAt: soon });
      const names = factors.map((f) => f.name);
      expect(names).toContain('sla_critical');
    });

    it('adds sla_warning factor for SLA between 4h and 24h', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const later = new Date(Date.now() + 10 * 3_600_000).toISOString();
      const factors = engine.computeFactors({ slaDueAt: later });
      const names = factors.map((f) => f.name);
      expect(names).toContain('sla_warning');
    });

    it('adds sensitive_domain factor for finance domain', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = engine.computeFactors({ automationDomain: 'finance' });
      const names = factors.map((f) => f.name);
      expect(names).toContain('sensitive_domain');
    });

    it('adds escalation_history factor when escalated is true', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = engine.computeFactors({ escalated: true });
      const names = factors.map((f) => f.name);
      expect(names).toContain('escalation_history');
    });
  });

  describe('scoreFromFactors (pure)', () => {
    it('returns 0 for empty factors', () => {
      const engine = new RiskScoringEngine({} as Pool);
      expect(engine.scoreFromFactors([])).toBe(0);
    });

    it('computes weighted average score', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = [
        { name: 'a', weight: 0.5, score: 80, detail: '' },
        { name: 'b', weight: 0.5, score: 60, detail: '' },
      ];
      expect(engine.scoreFromFactors(factors)).toBe(70);
    });

    it('caps score at 100', () => {
      const engine = new RiskScoringEngine({} as Pool);
      const factors = [{ name: 'x', weight: 1, score: 200, detail: '' }];
      expect(engine.scoreFromFactors(factors)).toBe(100);
    });
  });

  describe('assessRisk', () => {
    it('inserts and returns a risk assessment', async () => {
      const pool = makePool([ok([]), ok([riskRow])]);
      const engine = new RiskScoringEngine(pool);

      const result = await engine.assessRisk(
        ORG,
        AGENT_ID,
        { subjectType: 'action', subjectId: 'subj-1', data: {} },
        CORR_ID,
      );

      expect(result.id).toBe('risk-1');
      expect(result.organizationId).toBe(ORG);
      expect(result.riskScore).toBe(15);
      expect(result.riskLevel).toBe('low');

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]![0]).toContain('INSERT INTO risk_assessments');
    });

    it('sets recommendedAction for critical risk', async () => {
      const criticalRow = {
        ...riskRow,
        risk_score: '85.00',
        risk_level: 'critical',
        recommended_action: 'Escalate immediately to executive team',
      };
      const pool = makePool([ok([]), ok([criticalRow])]);
      const engine = new RiskScoringEngine(pool);

      const result = await engine.assessRisk(
        ORG,
        AGENT_ID,
        { subjectType: 'action', subjectId: 'subj-1', data: { amount: 50000 } },
        CORR_ID,
      );

      expect(result.recommendedAction).toBe('Escalate immediately to executive team');
    });

    it('includes executionId when provided', async () => {
      const pool = makePool([ok([]), ok([{ ...riskRow, execution_id: 'exec-1' }])]);
      const engine = new RiskScoringEngine(pool);

      const result = await engine.assessRisk(
        ORG,
        AGENT_ID,
        { subjectType: 'action', subjectId: 'subj-1', data: {} },
        CORR_ID,
        'exec-1',
      );

      expect(result.executionId).toBe('exec-1');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new RiskScoringEngine(pool);

      await expect(
        engine.assessRisk(
          ORG,
          AGENT_ID,
          { subjectType: 'action', subjectId: 'x', data: {} },
          CORR_ID,
        ),
      ).rejects.toThrow('INSERT INTO risk_assessments returned no row');
    });
  });

  describe('listAssessments', () => {
    it('returns assessments for an org', async () => {
      const pool = makePool([ok([]), ok([riskRow])]);
      const engine = new RiskScoringEngine(pool);

      const results = await engine.listAssessments(ORG);
      expect(results).toHaveLength(1);
    });

    it('filters by riskLevel and limit', async () => {
      const pool = makePool([ok([]), ok([riskRow])]);
      const engine = new RiskScoringEngine(pool);

      await engine.listAssessments(ORG, { riskLevel: 'high', limit: 5 });

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[1]![1] as unknown[];
      expect(params).toContain('high');
      expect(params).toContain(5);
    });

    it('returns empty array when no results', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new RiskScoringEngine(pool);

      expect(await engine.listAssessments(ORG)).toEqual([]);
    });
  });
});
