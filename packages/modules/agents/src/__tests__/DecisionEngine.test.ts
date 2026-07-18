import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { DecisionEngine } from '../decisions/DecisionEngine.js';
import type { DecisionRule } from '../types.js';

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
const DECISION_ID = '00000000-0000-0000-0000-000000000030';
const RULE_ID = '00000000-0000-0000-0000-000000000050';
const ACTOR_ID = '00000000-0000-0000-0000-000000000002';
const CORR_ID = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

const decisionRow = {
  id: DECISION_ID,
  organization_id: ORG,
  agent_id: AGENT_ID,
  execution_id: null,
  decision_type: 'approval',
  subject: 'Test subject',
  context: {},
  outcome: 'approved',
  confidence_score: '85.00',
  reasoning: 'Rule matched',
  rule_ids: [RULE_ID],
  requires_human_override: false,
  human_override_by: null,
  human_override_at: null,
  human_override_reason: null,
  correlation_id: CORR_ID,
  created_at: NOW,
};

const ruleRow = {
  id: RULE_ID,
  organization_id: ORG,
  name: 'Auto-approve low risk',
  description: null,
  automation_domain: 'operations',
  conditions: [{ field: 'amount', operator: 'lte', value: 1000 }],
  action: 'approved',
  priority: 10,
  is_active: true,
  created_by: ACTOR_ID,
  created_at: NOW,
  updated_at: NOW,
};

describe('DecisionEngine', () => {
  describe('loadRules', () => {
    it('returns rules for an org', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const engine = new DecisionEngine(pool);

      const rules = await engine.loadRules(ORG);

      expect(rules).toHaveLength(1);
      expect(rules[0]?.id).toBe(RULE_ID);
      expect(rules[0]?.name).toBe('Auto-approve low risk');

      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][1]).toEqual(['app.current_tenant', ORG]);
    });

    it('filters by automationDomain when provided', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const engine = new DecisionEngine(pool);

      await engine.loadRules(ORG, 'operations');

      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][1]).toContain('operations');
    });

    it('returns empty array when no rules', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new DecisionEngine(pool);

      const rules = await engine.loadRules(ORG);
      expect(rules).toEqual([]);
    });
  });

  describe('evaluate (pure)', () => {
    const baseRule: DecisionRule = {
      id: RULE_ID,
      organizationId: ORG,
      name: 'Small amount',
      automationDomain: 'operations',
      conditions: [{ field: 'amount', operator: 'lte', value: 1000 }],
      action: 'approved',
      priority: 10,
      isActive: true,
      createdBy: ACTOR_ID,
      createdAt: NOW,
      updatedAt: NOW,
    };

    it('returns approved when rule matches', () => {
      const result = new DecisionEngine({} as Pool).evaluate([baseRule], { amount: 500 }, 10);
      expect(result.outcome).toBe('approved');
      expect(result.matchedRuleIds).toContain(RULE_ID);
      expect(result.confidence).toBeGreaterThanOrEqual(70);
    });

    it('returns deferred when no rules match and risk < 70', () => {
      const result = new DecisionEngine({} as Pool).evaluate([baseRule], { amount: 5000 }, 30);
      expect(result.outcome).toBe('deferred');
      expect(result.matchedRuleIds).toHaveLength(0);
    });

    it('returns escalated when no rules match and risk >= 70', () => {
      const result = new DecisionEngine({} as Pool).evaluate([baseRule], { amount: 5000 }, 75);
      expect(result.outcome).toBe('escalated');
    });

    it('handles multiple matched rules and boosts confidence', () => {
      const rule2: DecisionRule = {
        ...baseRule,
        id: 'rule-2',
        conditions: [{ field: 'domain', operator: 'equals', value: 'ops' }],
      };
      const result = new DecisionEngine({} as Pool).evaluate(
        [baseRule, rule2],
        { amount: 500, domain: 'ops' },
        10,
      );
      expect(result.matchedRuleIds).toHaveLength(2);
      expect(result.confidence).toBe(80); // 70 + 2*5
    });

    it('evaluates all condition operators correctly', () => {
      const engine = new DecisionEngine({} as Pool);

      const makeRule = (operator: string, value: unknown): DecisionRule => ({
        ...baseRule,
        conditions: [
          { field: 'x', operator: operator as DecisionRule['conditions'][0]['operator'], value },
        ],
      });

      expect(engine.evaluate([makeRule('equals', 42)], { x: 42 }, 0).outcome).toBe('approved');
      expect(engine.evaluate([makeRule('not_equals', 42)], { x: 99 }, 0).outcome).toBe('approved');
      expect(engine.evaluate([makeRule('gt', 10)], { x: 11 }, 0).outcome).toBe('approved');
      expect(engine.evaluate([makeRule('gte', 10)], { x: 10 }, 0).outcome).toBe('approved');
      expect(engine.evaluate([makeRule('lt', 10)], { x: 9 }, 0).outcome).toBe('approved');
      expect(engine.evaluate([makeRule('lte', 10)], { x: 10 }, 0).outcome).toBe('approved');
      expect(engine.evaluate([makeRule('contains', 'foo')], { x: 'foobar' }, 0).outcome).toBe(
        'approved',
      );
      expect(engine.evaluate([makeRule('exists', null)], { x: 'something' }, 0).outcome).toBe(
        'approved',
      );
    });
  });

  describe('recordDecision', () => {
    it('records a decision and returns the mapped record', async () => {
      const pool = makePool([ok([]), ok([decisionRow])]);
      const engine = new DecisionEngine(pool);

      const result = await engine.recordDecision(
        ORG,
        AGENT_ID,
        'approval',
        'Test subject',
        {},
        'approved',
        85,
        'Rule matched',
        [RULE_ID],
        CORR_ID,
      );

      expect(result.id).toBe(DECISION_ID);
      expect(result.outcome).toBe('approved');
      expect(result.confidenceScore).toBe(85);
      expect(result.requiresHumanOverride).toBe(false);
      expect(result.executionId).toBeUndefined();

      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][0]).toContain('INSERT INTO decisions');
    });

    it('sets requiresHumanOverride when confidence < 60', async () => {
      const lowConfRow = {
        ...decisionRow,
        confidence_score: '55.00',
        requires_human_override: true,
      };
      const pool = makePool([ok([]), ok([lowConfRow])]);
      const engine = new DecisionEngine(pool);

      const result = await engine.recordDecision(
        ORG,
        AGENT_ID,
        'approval',
        'subj',
        {},
        'approved',
        55,
        'low confidence',
        [],
        CORR_ID,
      );

      expect(result.requiresHumanOverride).toBe(true);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new DecisionEngine(pool);

      await expect(
        engine.recordDecision(
          ORG,
          AGENT_ID,
          'approval',
          'subj',
          {},
          'approved',
          85,
          'ok',
          [],
          CORR_ID,
        ),
      ).rejects.toThrow('INSERT INTO decisions returned no row');
    });
  });

  describe('applyHumanOverride', () => {
    it('updates decision with override and returns mapped record', async () => {
      const overriddenRow = {
        ...decisionRow,
        outcome: 'rejected',
        human_override_by: ACTOR_ID,
        human_override_at: NOW,
        human_override_reason: 'Policy violation',
        requires_human_override: false,
      };
      const pool = makePool([ok([]), ok([overriddenRow])]);
      const engine = new DecisionEngine(pool);

      const result = await engine.applyHumanOverride(
        ORG,
        DECISION_ID,
        ACTOR_ID,
        'rejected',
        'Policy violation',
      );

      expect(result.outcome).toBe('rejected');
      expect(result.humanOverrideBy).toBe(ACTOR_ID);
      expect(result.humanOverrideReason).toBe('Policy violation');
    });

    it('throws when decision not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new DecisionEngine(pool);

      await expect(
        engine.applyHumanOverride(ORG, 'bad-id', ACTOR_ID, 'rejected', 'reason'),
      ).rejects.toThrow('Decision not found: bad-id');
    });
  });

  describe('listDecisions', () => {
    it('returns decisions for an org', async () => {
      const pool = makePool([ok([]), ok([decisionRow])]);
      const engine = new DecisionEngine(pool);

      const results = await engine.listDecisions(ORG);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(DECISION_ID);
    });

    it('filters by agentId and requiresHumanOverride', async () => {
      const pool = makePool([ok([]), ok([decisionRow])]);
      const engine = new DecisionEngine(pool);

      await engine.listDecisions(ORG, {
        agentId: AGENT_ID,
        requiresHumanOverride: true,
        limit: 10,
      });

      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const params = calls[1][1] as unknown[];
      expect(params).toContain(AGENT_ID);
      expect(params).toContain(true);
      expect(params).toContain(10);
    });

    it('returns empty array when no decisions', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new DecisionEngine(pool);

      const results = await engine.listDecisions(ORG);
      expect(results).toEqual([]);
    });
  });

  describe('createRule', () => {
    it('inserts a rule and returns the mapped record', async () => {
      const pool = makePool([ok([]), ok([ruleRow])]);
      const engine = new DecisionEngine(pool);

      const result = await engine.createRule(ORG, {
        name: 'Auto-approve low risk',
        automationDomain: 'operations',
        conditions: [{ field: 'amount', operator: 'lte', value: 1000 }],
        action: 'approved',
        createdBy: ACTOR_ID,
      });

      expect(result.id).toBe(RULE_ID);
      expect(result.name).toBe('Auto-approve low risk');
      expect(result.isActive).toBe(true);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const engine = new DecisionEngine(pool);

      await expect(
        engine.createRule(ORG, {
          name: 'X',
          automationDomain: 'ops',
          conditions: [],
          action: 'approved',
          createdBy: ACTOR_ID,
        }),
      ).rejects.toThrow('INSERT INTO decision_rules returned no row');
    });
  });
});
