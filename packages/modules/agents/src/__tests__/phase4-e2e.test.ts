/**
 * Phase 4 — Agent OS end-to-end tests
 *
 * Covers the full lifecycle:
 *   AgentRegistryService → AgentRuntime (execute) → DecisionEngine → RiskScoringEngine → GovernanceEngine
 *
 * All DB calls are mocked via a pool factory; no real database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { AgentExecution } from '../types.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { DecisionEngine } from '../decisions/DecisionEngine.js';
import { RiskScoringEngine } from '../decisions/RiskScoringEngine.js';
import { GovernanceEngine } from '../governance/GovernanceEngine.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000010';
const EXEC_ID = '00000000-0000-0000-0000-000000000020';
const DECISION_ID = '00000000-0000-0000-0000-000000000030';
const RISK_ID = '00000000-0000-0000-0000-000000000040';
const ACTOR_ID = '00000000-0000-0000-0000-000000000002';
const CORR_ID = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

const agentRow = {
  id: AGENT_ID,
  organization_id: ORG,
  name: 'Ops Copilot',
  description: null,
  agent_type: 'operations_copilot',
  capabilities: ['read_workflows', 'write_tasks'],
  automation_domains: ['operations'],
  config: {},
  is_active: true,
  version: 1,
  created_by: ACTOR_ID,
  created_at: NOW,
  updated_at: NOW,
};

const execRow = {
  id: EXEC_ID,
  organization_id: ORG,
  agent_id: AGENT_ID,
  trigger_type: 'manual',
  trigger_data: {},
  status: 'completed',
  input: { task: 'review budget' },
  output: {
    decisionOutcome: 'approved',
    confidenceScore: 80,
    riskScore: 0,
    riskLevel: 'low',
    recommendationCount: 0,
  },
  decisions: [],
  recommendations: [],
  risk_score: '0.00',
  requires_human_approval: false,
  human_approved_by: null,
  human_approved_at: null,
  correlation_id: CORR_ID,
  started_at: NOW,
  completed_at: NOW,
  created_at: NOW,
  updated_at: NOW,
};

const decisionRow = {
  id: DECISION_ID,
  organization_id: ORG,
  agent_id: AGENT_ID,
  execution_id: EXEC_ID,
  decision_type: 'action',
  subject: 'Agent execution: Ops Copilot',
  context: {},
  outcome: 'approved',
  confidence_score: '80.00',
  reasoning: 'No matching rules found; deferring to default handling',
  rule_ids: [],
  requires_human_override: false,
  human_override_by: null,
  human_override_at: null,
  human_override_reason: null,
  correlation_id: CORR_ID,
  created_at: NOW,
};

const riskRow = {
  id: RISK_ID,
  organization_id: ORG,
  agent_id: AGENT_ID,
  execution_id: EXEC_ID,
  subject_type: 'action',
  subject_id: EXEC_ID,
  risk_score: '0.00',
  risk_level: 'low',
  risk_factors: [],
  recommended_action: null,
  correlation_id: CORR_ID,
  created_at: NOW,
};

const contextRow = {
  id: '00000000-0000-0000-0000-000000000050',
  organization_id: ORG,
  agent_id: AGENT_ID,
  execution_id: EXEC_ID,
  context_data: {},
  workflow_runs: [],
  pending_approvals: [],
  recent_decisions: [],
  created_at: NOW,
};

// ─── AgentRegistryService ─────────────────────────────────────────────────────

describe('AgentRegistryService', () => {
  let pool: Pool;
  let service: AgentRegistryService;

  beforeEach(() => {
    pool = { query: vi.fn().mockResolvedValue(ok([agentRow])) } as unknown as Pool;
    service = new AgentRegistryService(pool);
  });

  it('registerAgent — inserts with parameterized query and returns typed Agent', async () => {
    const agent = await service.registerAgent({
      organizationId: ORG,
      name: 'Ops Copilot',
      agentType: 'operations_copilot',
      capabilities: ['read_workflows', 'write_tasks'],
      automationDomains: ['operations'],
      createdBy: ACTOR_ID,
    });

    expect(agent.id).toBe(AGENT_ID);
    expect(agent.agentType).toBe('operations_copilot');
    expect(agent.isActive).toBe(true);
    expect(agent.capabilities).toEqual(['read_workflows', 'write_tasks']);

    const query = pool.query as ReturnType<typeof vi.fn>;
    // first call sets tenant context, second is INSERT
    const [insertSql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(insertSql).toMatch(/INSERT INTO agents/i);
    // no interpolation — all values should be in params array
    expect(insertSql).not.toContain(ORG);
    expect(params[0]).toBe(ORG);
  });

  it('registerAgent — always calls set_config before INSERT', async () => {
    await service.registerAgent({
      organizationId: ORG,
      name: 'Test',
      agentType: 'custom',
      capabilities: [],
      automationDomains: [],
      createdBy: ACTOR_ID,
    });

    const query = pool.query as ReturnType<typeof vi.fn>;
    const [firstSql, firstParams] = query.mock.calls[0] as [string, unknown[]];
    expect(firstSql).toMatch(/set_config/i);
    expect(firstParams[1]).toBe(ORG);
  });

  it('getAgent — returns null when no rows', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
    const agent = await service.getAgent(ORG, AGENT_ID);
    expect(agent).toBeNull();
  });

  it('getAgent — returns typed Agent when found', async () => {
    const agent = await service.getAgent(ORG, AGENT_ID);
    expect(agent).not.toBeNull();
    expect(agent?.organizationId).toBe(ORG);
    expect(agent?.name).toBe('Ops Copilot');
  });

  it('listAgents — builds WHERE clause dynamically for agentType filter', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([agentRow]));
    const agents = await service.listAgents(ORG, { agentType: 'operations_copilot' });
    expect(agents).toHaveLength(1);

    const query = pool.query as ReturnType<typeof vi.fn>;
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/agent_type = \$2/);
    expect(params[1]).toBe('operations_copilot');
  });

  it('listAgents — isActive filter appended correctly', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
    await service.listAgents(ORG, { isActive: false });

    const query = pool.query as ReturnType<typeof vi.fn>;
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/is_active = \$2/);
    expect(params[1]).toBe(false);
  });

  it('deactivateAgent — UPDATE uses parameterized query and returns deactivated Agent', async () => {
    const deactivatedRow = { ...agentRow, is_active: false };
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([deactivatedRow]));

    const agent = await service.deactivateAgent(ORG, AGENT_ID);
    expect(agent.isActive).toBe(false);

    const query = pool.query as ReturnType<typeof vi.fn>;
    const [sql] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE agents/i);
    expect(sql).toMatch(/is_active = false/);
  });

  it('deactivateAgent — throws when agent not found', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
    await expect(service.deactivateAgent(ORG, AGENT_ID)).rejects.toThrow('Agent not found');
  });
});

// ─── RiskScoringEngine (pure logic) ──────────────────────────────────────────

describe('RiskScoringEngine — factor computation', () => {
  let engine: RiskScoringEngine;

  beforeEach(() => {
    const pool = { query: vi.fn().mockResolvedValue(ok([riskRow])) } as unknown as Pool;
    engine = new RiskScoringEngine(pool);
  });

  it('returns empty factors for low-risk context', () => {
    const factors = engine.computeFactors({ task: 'review minutes' });
    expect(factors).toHaveLength(0);
    expect(engine.scoreFromFactors(factors)).toBe(0);
  });

  it('high_value factor triggered above $10k', () => {
    const factors = engine.computeFactors({ amount: 50000 });
    const names = factors.map((f) => f.name);
    expect(names).toContain('high_value');
    expect(engine.scoreFromFactors(factors)).toBeGreaterThan(0);
  });

  it('medium_value factor triggered between $2.5k and $10k', () => {
    const factors = engine.computeFactors({ amount: 5000 });
    const names = factors.map((f) => f.name);
    expect(names).toContain('medium_value');
    expect(names).not.toContain('high_value');
  });

  it('sla_breached factor triggered for past due date', () => {
    const factors = engine.computeFactors({ slaDueAt: '2020-01-01T00:00:00.000Z' });
    expect(factors.map((f) => f.name)).toContain('sla_breached');
    expect(engine.scoreFromFactors(factors)).toBe(100);
  });

  it('sensitive_domain factor triggered for finance domain', () => {
    const factors = engine.computeFactors({ automationDomain: 'finance' });
    expect(factors.map((f) => f.name)).toContain('sensitive_domain');
  });

  it('escalation_history factor triggered when escalated=true', () => {
    const factors = engine.computeFactors({ escalated: true });
    expect(factors.map((f) => f.name)).toContain('escalation_history');
  });

  it('scoreFromFactors — weighted average capped at 100', () => {
    const factors = engine.computeFactors({ amount: 999999, slaDueAt: '2020-01-01T00:00:00Z' });
    const score = engine.scoreFromFactors(factors);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(50);
  });

  it('assessRisk — persists assessment with parameterized INSERT', async () => {
    const pool = { query: vi.fn().mockResolvedValue(ok([riskRow])) } as unknown as Pool;
    engine = new RiskScoringEngine(pool);

    const result = await engine.assessRisk(
      ORG,
      AGENT_ID,
      { subjectType: 'action', subjectId: EXEC_ID, data: {} },
      CORR_ID,
      EXEC_ID,
    );

    expect(result.riskLevel).toBe('low');
    const query = pool.query as ReturnType<typeof vi.fn>;
    const [sql] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO risk_assessments/i);
    expect(sql).not.toContain(ORG);
  });

  it('listAssessments — filters by riskLevel', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue(ok([{ ...riskRow, risk_level: 'high' }])),
    } as unknown as Pool;
    engine = new RiskScoringEngine(pool);

    const results = await engine.listAssessments(ORG, { riskLevel: 'high' });
    expect(results[0]?.riskLevel).toBe('high');

    const query = pool.query as ReturnType<typeof vi.fn>;
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/risk_level = \$2/);
    expect(params[1]).toBe('high');
  });
});

// ─── DecisionEngine ───────────────────────────────────────────────────────────

describe('DecisionEngine', () => {
  let pool: Pool;
  let engine: DecisionEngine;

  beforeEach(() => {
    pool = { query: vi.fn().mockResolvedValue(ok([decisionRow])) } as unknown as Pool;
    engine = new DecisionEngine(pool);
  });

  describe('evaluate (pure, no DB)', () => {
    it('returns deferred when no rules match and risk < 70', () => {
      const result = engine.evaluate([], {}, 30);
      expect(result.outcome).toBe('deferred');
      expect(result.confidence).toBe(50);
      expect(result.matchedRuleIds).toHaveLength(0);
    });

    it('returns escalated when no rules match and risk >= 70', () => {
      const result = engine.evaluate([], {}, 75);
      expect(result.outcome).toBe('escalated');
      expect(result.confidence).toBe(60);
    });

    it('matches rule and returns its action as outcome', () => {
      const rule = {
        id: 'r1',
        organizationId: ORG,
        name: 'High value approval',
        automationDomain: 'finance',
        conditions: [{ field: 'amount', operator: 'gt' as const, value: 1000 }],
        action: 'approved',
        priority: 10,
        isActive: true,
        createdBy: ACTOR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const result = engine.evaluate([rule], { amount: 5000 }, 20);
      expect(result.outcome).toBe('approved');
      expect(result.matchedRuleIds).toContain('r1');
      expect(result.confidence).toBeGreaterThan(70);
    });

    it('all conditions must match — partial match fails', () => {
      const rule = {
        id: 'r2',
        organizationId: ORG,
        name: 'Multi-condition rule',
        automationDomain: 'operations',
        conditions: [
          { field: 'amount', operator: 'gt' as const, value: 1000 },
          { field: 'status', operator: 'equals' as const, value: 'pending' },
        ],
        action: 'approved',
        priority: 5,
        isActive: true,
        createdBy: ACTOR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };
      // amount matches but status doesn't
      const result = engine.evaluate([rule], { amount: 5000, status: 'done' }, 10);
      expect(result.outcome).toBe('deferred');
    });

    it('confidence scales with number of matched rules (capped at 95)', () => {
      const makeRule = (id: string) => ({
        id,
        organizationId: ORG,
        name: `Rule ${id}`,
        automationDomain: 'ops',
        conditions: [{ field: 'x', operator: 'exists' as const, value: null }],
        action: 'approved',
        priority: 1,
        isActive: true,
        createdBy: ACTOR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const rules = [
        makeRule('r1'),
        makeRule('r2'),
        makeRule('r3'),
        makeRule('r4'),
        makeRule('r5'),
      ];
      const result = engine.evaluate(rules, { x: true }, 0);
      expect(result.confidence).toBeLessThanOrEqual(95);
      expect(result.confidence).toBeGreaterThan(70);
    });
  });

  describe('recordDecision', () => {
    it('inserts with parameterized query; sets requiresHumanOverride when confidence < 60', async () => {
      const lowConfidenceRow = {
        ...decisionRow,
        confidence_score: '55.00',
        requires_human_override: true,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([lowConfidenceRow]));

      const decision = await engine.recordDecision(
        ORG,
        AGENT_ID,
        'action',
        'test subject',
        {},
        'deferred',
        55,
        'low confidence',
        [],
        CORR_ID,
      );

      expect(decision.requiresHumanOverride).toBe(true);
      expect(decision.confidenceScore).toBe(55);

      const query = pool.query as ReturnType<typeof vi.fn>;
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO decisions/i);
      expect(sql).not.toContain(ORG);
      expect(params[0]).toBe(ORG);
    });

    it('escalated outcome forces requiresHumanOverride regardless of confidence', async () => {
      const escalatedRow = { ...decisionRow, outcome: 'escalated', requires_human_override: true };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([escalatedRow]));

      const decision = await engine.recordDecision(
        ORG,
        AGENT_ID,
        'action',
        'test',
        {},
        'escalated',
        90,
        'escalated',
        [],
        CORR_ID,
      );
      expect(decision.requiresHumanOverride).toBe(true);
    });
  });

  describe('applyHumanOverride', () => {
    it('updates outcome and clears requiresHumanOverride flag', async () => {
      const overrideRow = {
        ...decisionRow,
        outcome: 'approved',
        requires_human_override: false,
        human_override_by: ACTOR_ID,
        human_override_reason: 'Director approval',
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([overrideRow]));

      const decision = await engine.applyHumanOverride(
        ORG,
        DECISION_ID,
        ACTOR_ID,
        'approved',
        'Director approval',
      );

      expect(decision.outcome).toBe('approved');
      expect(decision.requiresHumanOverride).toBe(false);
      expect(decision.humanOverrideBy).toBe(ACTOR_ID);

      const query = pool.query as ReturnType<typeof vi.fn>;
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toMatch(/UPDATE decisions/i);
      expect(params[2]).toBe('approved');
      expect(params[3]).toBe(ACTOR_ID);
      expect(params[4]).toBe('Director approval');
    });

    it('throws when decision not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
      await expect(
        engine.applyHumanOverride(ORG, DECISION_ID, ACTOR_ID, 'approved', 'test'),
      ).rejects.toThrow('Decision not found');
    });
  });

  describe('createRule', () => {
    it('inserts rule with parameterized query', async () => {
      const ruleRow = {
        id: 'r1',
        organization_id: ORG,
        name: 'Finance rule',
        description: null,
        automation_domain: 'finance',
        conditions: [{ field: 'amount', operator: 'gt', value: 10000 }],
        action: 'escalate',
        priority: 10,
        is_active: true,
        created_by: ACTOR_ID,
        created_at: NOW,
        updated_at: NOW,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([ruleRow]));

      const rule = await engine.createRule(ORG, {
        name: 'Finance rule',
        automationDomain: 'finance',
        conditions: [{ field: 'amount', operator: 'gt', value: 10000 }],
        action: 'escalate',
        priority: 10,
        createdBy: ACTOR_ID,
      });

      expect(rule.name).toBe('Finance rule');
      expect(rule.automationDomain).toBe('finance');
      expect(rule.isActive).toBe(true);

      const query = pool.query as ReturnType<typeof vi.fn>;
      const [sql] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO decision_rules/i);
    });
  });

  describe('listDecisions', () => {
    it('filters by agentId when provided', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([decisionRow]));
      await engine.listDecisions(ORG, { agentId: AGENT_ID });

      const query = pool.query as ReturnType<typeof vi.fn>;
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toMatch(/agent_id = \$2/);
      expect(params[1]).toBe(AGENT_ID);
    });

    it('filters by requiresHumanOverride', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
      await engine.listDecisions(ORG, { requiresHumanOverride: true });

      const query = pool.query as ReturnType<typeof vi.fn>;
      const [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toMatch(/requires_human_override = \$2/);
      expect(params[1]).toBe(true);
    });
  });
});

// ─── GovernanceEngine ─────────────────────────────────────────────────────────

describe('GovernanceEngine', () => {
  let pool: Pool;
  let engine: GovernanceEngine;

  const memberWithRole = (role: string) => ({ id: ACTOR_ID, role });

  beforeEach(() => {
    pool = {
      query: vi.fn().mockResolvedValue(ok([memberWithRole('manager')])),
    } as unknown as Pool;
    engine = new GovernanceEngine(pool);
  });

  it('validateCapability — manager can trigger_workflows', async () => {
    const result = await engine.validateCapability(ORG, ACTOR_ID, 'trigger_workflows');
    expect(result.allowed).toBe(true);
  });

  it('validateCapability — member cannot trigger_workflows', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([memberWithRole('member')]));
    const result = await engine.validateCapability(ORG, ACTOR_ID, 'trigger_workflows');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not authorized');
  });

  it('validateCapability — member can read_workflows', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([memberWithRole('member')]));
    const result = await engine.validateCapability(ORG, ACTOR_ID, 'read_workflows');
    expect(result.allowed).toBe(true);
  });

  it('validateCapability — non-member always denied', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
    const result = await engine.validateCapability(ORG, ACTOR_ID, 'read_workflows');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not an active member');
  });

  it('validateCapability — null role defaults to member', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([{ id: ACTOR_ID, role: null }]));
    // member role cannot write_tasks
    const result = await engine.validateCapability(ORG, ACTOR_ID, 'write_tasks');
    expect(result.allowed).toBe(false);
  });

  it('validateAgentWriteAction — returns audit trail on every call', async () => {
    const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'trigger_workflow', {});
    expect(result.auditTrail).toMatchObject({
      actorId: ACTOR_ID,
      action: 'trigger_workflow',
      organizationId: ORG,
    });
  });

  it('validateAgentWriteAction — unknown action is denied with audit trail', async () => {
    const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'unknown_action', {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unknown action');
    expect(result.auditTrail).toBeDefined();
  });

  it('validateAgentWriteAction — owner can approve_decision', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([memberWithRole('owner')]));
    const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'approve_decision', {});
    expect(result.allowed).toBe(true);
  });

  it('validateAgentWriteAction — admin can assess_risk', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue(ok([memberWithRole('admin')]));
    const result = await engine.validateAgentWriteAction(ORG, ACTOR_ID, 'assess_risk', {});
    expect(result.allowed).toBe(true);
  });

  it('always calls set_config before capability check', async () => {
    await engine.validateCapability(ORG, ACTOR_ID, 'read_analytics');
    const query = pool.query as ReturnType<typeof vi.fn>;
    const [firstSql, firstParams] = query.mock.calls[0] as [string, unknown[]];
    expect(firstSql).toMatch(/set_config/i);
    expect(firstParams[1]).toBe(ORG);
  });
});

// ─── AgentRuntime ─────────────────────────────────────────────────────────────

describe('AgentRuntime', () => {
  let pool: Pool;
  let runtime: AgentRuntime;

  function makeRuntimePool(): Pool {
    const query = vi.fn();
    // buildContext issues: set_config + 4 parallel queries (Promise.all) + 1 INSERT snapshot
    // So the full call sequence inside execute() is:
    //  0: set_config (runtime.setTenantContext)
    //  1: INSERT agent_executions → execRow
    //  2: set_config (contextEngine.setTenantContext)
    //  3..6: Promise.all([wf, approvals, decisions, org]) — 4 SELECTs, each returns ok([])
    //  7: INSERT agent_context_snapshots → contextRow
    //  8: set_config (riskEngine.setTenantContext)
    //  9: INSERT risk_assessments → riskRow
    // 10: set_config (decisionEngine.loadRules → setTenantContext)
    // 11: SELECT decision_rules → []
    // 12: set_config (decisionEngine.recordDecision → setTenantContext)
    // 13: INSERT decisions → decisionRow
    // 14: UPDATE agent_executions → completed
    query
      .mockResolvedValueOnce(ok([])) //  0: set_config
      .mockResolvedValueOnce(ok([execRow])) //  1: INSERT exec
      .mockResolvedValueOnce(ok([])) //  2: set_config context
      .mockResolvedValueOnce(ok([])) //  3: SELECT workflow_runs
      .mockResolvedValueOnce(ok([])) //  4: SELECT approvals
      .mockResolvedValueOnce(ok([])) //  5: SELECT decisions
      .mockResolvedValueOnce(ok([{ member_count: '0', workflow_count: '0' }])) // 6: org counts
      .mockResolvedValueOnce(ok([contextRow])) //  7: INSERT context_snapshots
      .mockResolvedValueOnce(ok([])) //  8: set_config risk
      .mockResolvedValueOnce(ok([riskRow])) //  9: INSERT risk_assessments
      .mockResolvedValueOnce(ok([])) // 10: set_config rules
      .mockResolvedValueOnce(ok([])) // 11: SELECT decision_rules
      .mockResolvedValueOnce(ok([])) // 12: set_config decision
      .mockResolvedValueOnce(ok([decisionRow])) // 13: INSERT decisions
      .mockResolvedValueOnce(ok([{ ...execRow, status: 'completed' }])); // 14: UPDATE exec
    return { query } as unknown as Pool;
  }

  beforeEach(() => {
    pool = makeRuntimePool();
    runtime = new AgentRuntime(pool);
  });

  const agent = {
    id: AGENT_ID,
    organizationId: ORG,
    name: 'Ops Copilot',
    agentType: 'operations_copilot' as const,
    capabilities: ['read_workflows' as const, 'write_tasks' as const],
    automationDomains: ['operations'],
    config: {},
    isActive: true,
    version: 1,
    createdBy: ACTOR_ID,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('execute — full pipeline runs without error and returns AgentExecution', async () => {
    const execution = await runtime.execute(agent, {
      organizationId: ORG,
      agentId: AGENT_ID,
      triggerType: 'manual',
      input: { task: 'review budget' },
      actorId: ACTOR_ID,
      correlationId: CORR_ID,
    });

    expect(execution.id).toBe(EXEC_ID);
    expect(execution.organizationId).toBe(ORG);
    expect(execution.status).toBe('completed');
    expect(execution.correlationId).toBe(CORR_ID);
  });

  it('execute — first DB call is INSERT agent_executions with status running', async () => {
    await runtime.execute(agent, {
      organizationId: ORG,
      agentId: AGENT_ID,
      triggerType: 'manual',
      input: {},
      actorId: ACTOR_ID,
      correlationId: CORR_ID,
    });

    const query = pool.query as ReturnType<typeof vi.fn>;
    const [insertSql] = query.mock.calls[1] as [string, unknown[]];
    expect(insertSql).toMatch(/INSERT INTO agent_executions/i);
    expect(insertSql).toMatch(/'running'/i);
  });

  it('execute — marks execution as failed and rethrows on pipeline error', async () => {
    const errorPool = { query: vi.fn() } as unknown as Pool;
    (errorPool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(ok([])) // set_config (runtime)
      .mockResolvedValueOnce(ok([execRow])) // INSERT exec
      .mockResolvedValueOnce(ok([])) // set_config (context engine)
      .mockRejectedValueOnce(new Error('context engine failure')); // first parallel query fails

    const errorRuntime = new AgentRuntime(errorPool);

    await expect(
      errorRuntime.execute(agent, {
        organizationId: ORG,
        agentId: AGENT_ID,
        triggerType: 'manual',
        input: {},
        actorId: ACTOR_ID,
        correlationId: CORR_ID,
      }),
    ).rejects.toThrow('context engine failure');

    const query = errorPool.query as ReturnType<typeof vi.fn>;
    const calls = query.mock.calls as [string, unknown[]][];
    const failureUpdate = calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(failureUpdate).toBeDefined();
  });

  it('listExecutions — filters by agentId and status', async () => {
    const listPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok([execRow])),
    } as unknown as Pool;
    const listRuntime = new AgentRuntime(listPool);

    const results = await listRuntime.listExecutions(ORG, {
      agentId: AGENT_ID,
      status: 'completed',
    });
    expect(results).toHaveLength(1);

    const query = listPool.query as ReturnType<typeof vi.fn>;
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/agent_id = \$2/);
    expect(sql).toMatch(/status = \$3/);
    expect(params[1]).toBe(AGENT_ID);
    expect(params[2]).toBe('completed');
  });

  it('approveExecution — sets status to completed and records approver', async () => {
    const approvedRow = {
      ...execRow,
      status: 'completed',
      human_approved_by: ACTOR_ID,
      requires_human_approval: false,
    };
    const approvePool = {
      query: vi
        .fn()
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok([approvedRow])),
    } as unknown as Pool;
    const approveRuntime = new AgentRuntime(approvePool);

    const execution = await approveRuntime.approveExecution(ORG, EXEC_ID, ACTOR_ID);
    expect(execution.status).toBe('completed');
    expect(execution.humanApprovedBy).toBe(ACTOR_ID);
    expect(execution.requiresHumanApproval).toBe(false);

    const query = approvePool.query as ReturnType<typeof vi.fn>;
    const [sql] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/human_approved_by = \$3/);
  });

  it('approveExecution — throws when execution not found', async () => {
    const notFoundPool = {
      query: vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([])),
    } as unknown as Pool;
    const r = new AgentRuntime(notFoundPool);
    await expect(r.approveExecution(ORG, EXEC_ID, ACTOR_ID)).rejects.toThrow('Execution not found');
  });

  const baseExecution: AgentExecution = {
    id: EXEC_ID,
    organizationId: ORG,
    agentId: AGENT_ID,
    triggerType: 'manual',
    triggerData: {},
    status: 'completed',
    input: {},
    output: {},
    decisions: [],
    recommendations: [],
    requiresHumanApproval: false,
    correlationId: CORR_ID,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('buildRiskAssessmentsFromExecution — derives riskLevel from score', () => {
    const assessments = runtime.buildRiskAssessmentsFromExecution({
      ...baseExecution,
      riskScore: 85,
    });
    expect(assessments[0]?.riskLevel).toBe('critical');
  });

  it('buildRiskAssessmentsFromExecution — low score maps to low riskLevel', () => {
    const assessments = runtime.buildRiskAssessmentsFromExecution({
      ...baseExecution,
      riskScore: 10,
    });
    expect(assessments[0]?.riskLevel).toBe('low');
  });
});

// ─── Cross-tenant isolation assertions ───────────────────────────────────────

describe('Cross-tenant isolation — set_config called before every query', () => {
  it('AgentRegistryService always scopes to correct tenant', async () => {
    const pool = { query: vi.fn().mockResolvedValue(ok([agentRow])) } as unknown as Pool;
    const service = new AgentRegistryService(pool);

    await service.listAgents('tenant-A');
    await service.listAgents('tenant-B');

    const query = pool.query as ReturnType<typeof vi.fn>;
    const calls = query.mock.calls as [string, unknown[]][];
    const configs = calls.filter(([sql]) => sql.includes('set_config'));
    // each call is [sql, [key, value]] — tenant is the second param element
    expect((configs[0]?.[1] as string[])[1]).toBe('tenant-A');
    expect((configs[1]?.[1] as string[])[1]).toBe('tenant-B');
  });

  it('GovernanceEngine always scopes to correct tenant', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok([{ id: ACTOR_ID, role: 'manager' }]))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok([{ id: ACTOR_ID, role: 'member' }])),
    } as unknown as Pool;
    const engine = new GovernanceEngine(pool);

    const r1 = await engine.validateCapability('org-A', ACTOR_ID, 'trigger_workflows');
    const r2 = await engine.validateCapability('org-B', ACTOR_ID, 'trigger_workflows');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(false);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const configCalls = calls.filter(([sql]) => sql.includes('set_config'));
    expect((configCalls[0]?.[1] as string[])[1]).toBe('org-A');
    expect((configCalls[1]?.[1] as string[])[1]).toBe('org-B');
  });
});
