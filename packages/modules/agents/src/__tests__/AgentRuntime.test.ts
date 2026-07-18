/**
 * AgentRuntime unit tests
 *
 * Tests cover: getExecution, listExecutions, approveExecution, buildRiskAssessmentsFromExecution.
 * The execute() method requires the full @galaxy/cognitive-engine stack and is covered
 * by the phase4-e2e integration test.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';

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
const EXEC_ID = '00000000-0000-0000-0000-000000000020';
const ACTOR_ID = '00000000-0000-0000-0000-000000000002';
const CORR_ID = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

const execRow = {
  id: EXEC_ID,
  organization_id: ORG,
  agent_id: AGENT_ID,
  trigger_type: 'manual',
  trigger_data: {},
  status: 'completed',
  input: {},
  output: { riskScore: 20, riskLevel: 'low' },
  decisions: [],
  recommendations: [],
  risk_score: '20.00',
  requires_human_approval: false,
  human_approved_by: null,
  human_approved_at: null,
  correlation_id: CORR_ID,
  started_at: NOW,
  completed_at: NOW,
  created_at: NOW,
  updated_at: NOW,
};

// AgentRuntime constructor instantiates cognitive-engine classes.
// We mock the module to prevent real implementations from running.
vi.mock('@galaxy/cognitive-engine', () => {
  const noop = () => ({});
  const asyncNoop = async () => ({});
  class FakeEngine {
    enrich = asyncNoop;
    analyze = () => ({
      intent: 'query_information',
      goal: { description: 'test goal', priority: 'medium' },
      entities: [],
      predictedActions: [],
    });
    reason = noop;
    createPlan = () => ({ goal: 'test', tasks: [], complexity: 1 });
    executePlan = asyncNoop;
    verify = () => ({ status: 'passed', confidenceScore: 0.9, requiresHumanReview: false });
    recordOutcome = asyncNoop;
    detectBottlenecks = async () => {};
    evaluate = async () => ({ humanApprovalRequired: false, reason: 'ok', riskLevel: 'low' });
  }
  return {
    GxContextEngine: FakeEngine,
    GxIntentEngine: FakeEngine,
    GxReasoningEngine: FakeEngine,
    GxPlanningEngine: FakeEngine,
    GxExecutionEngine: FakeEngine,
    GxVerificationEngine: FakeEngine,
    GxLearningEngine: FakeEngine,
    GxOptimizationEngine: FakeEngine,
    GxGovernanceEngine: FakeEngine,
    GxCommunicationEngine: FakeEngine,
    GxMemoryEngine: FakeEngine,
  };
});

// Import AFTER the mock is declared
const { AgentRuntime } = await import('../runtime/AgentRuntime.js');

describe('AgentRuntime', () => {
  describe('getExecution', () => {
    it('returns a mapped execution when found', async () => {
      const pool = makePool([ok([]), ok([execRow])]);
      const runtime = new AgentRuntime(pool);

      const result = await runtime.getExecution(ORG, EXEC_ID);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(EXEC_ID);
      expect(result?.status).toBe('completed');
      expect(result?.riskScore).toBe(20);
      expect(result?.startedAt).toBe(NOW);
      expect(result?.completedAt).toBe(NOW);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toEqual(['app.current_tenant', ORG]);
      expect(calls[1]![1]).toEqual([ORG, EXEC_ID]);
    });

    it('returns null when execution not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const runtime = new AgentRuntime(pool);

      const result = await runtime.getExecution(ORG, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listExecutions', () => {
    it('returns executions for an org', async () => {
      const pool = makePool([ok([]), ok([execRow])]);
      const runtime = new AgentRuntime(pool);

      const results = await runtime.listExecutions(ORG);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(EXEC_ID);
    });

    it('filters by agentId and status', async () => {
      const pool = makePool([ok([]), ok([execRow])]);
      const runtime = new AgentRuntime(pool);

      await runtime.listExecutions(ORG, { agentId: AGENT_ID, status: 'completed', limit: 5 });

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[1]![1] as unknown[];
      expect(params).toContain(AGENT_ID);
      expect(params).toContain('completed');
      expect(params).toContain(5);
    });

    it('returns empty array when no executions', async () => {
      const pool = makePool([ok([]), ok([])]);
      const runtime = new AgentRuntime(pool);

      expect(await runtime.listExecutions(ORG)).toEqual([]);
    });
  });

  describe('approveExecution', () => {
    it('sets execution to completed with human approval fields', async () => {
      const approvedRow = {
        ...execRow,
        human_approved_by: ACTOR_ID,
        human_approved_at: NOW,
        requires_human_approval: false,
      };
      const pool = makePool([ok([]), ok([approvedRow])]);
      const runtime = new AgentRuntime(pool);

      const result = await runtime.approveExecution(ORG, EXEC_ID, ACTOR_ID);

      expect(result.humanApprovedBy).toBe(ACTOR_ID);
      expect(result.requiresHumanApproval).toBe(false);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]![0]).toContain('UPDATE agent_executions');
      expect(calls[1]![1]).toEqual([ORG, EXEC_ID, ACTOR_ID]);
    });

    it('throws when execution not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const runtime = new AgentRuntime(pool);

      await expect(runtime.approveExecution(ORG, 'bad-id', ACTOR_ID)).rejects.toThrow(
        'Execution not found: bad-id',
      );
    });
  });

  describe('buildRiskAssessmentsFromExecution', () => {
    it('builds a low risk assessment for low risk score', () => {
      const runtime = new AgentRuntime(makePool([]));
      const execution = {
        id: EXEC_ID,
        organizationId: ORG,
        agentId: AGENT_ID,
        triggerType: 'manual' as const,
        triggerData: {},
        status: 'completed' as const,
        input: {},
        output: {},
        decisions: [],
        recommendations: [],
        riskScore: 20,
        requiresHumanApproval: false,
        correlationId: CORR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };

      const assessments = runtime.buildRiskAssessmentsFromExecution(execution);

      expect(assessments).toHaveLength(1);
      expect(assessments[0]?.riskScore).toBe(20);
      expect(assessments[0]?.riskLevel).toBe('low');
      expect(assessments[0]?.executionId).toBe(EXEC_ID);
    });

    it('assigns critical risk level when riskScore >= 80', () => {
      const runtime = new AgentRuntime(makePool([]));
      const execution = {
        id: EXEC_ID,
        organizationId: ORG,
        agentId: AGENT_ID,
        triggerType: 'manual' as const,
        triggerData: {},
        status: 'completed' as const,
        input: {},
        output: {},
        decisions: [],
        recommendations: [],
        riskScore: 85,
        requiresHumanApproval: true,
        correlationId: CORR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };

      const assessments = runtime.buildRiskAssessmentsFromExecution(execution);
      expect(assessments[0]?.riskLevel).toBe('critical');
    });

    it('defaults to 0 risk score when riskScore is undefined', () => {
      const runtime = new AgentRuntime(makePool([]));
      const execution = {
        id: EXEC_ID,
        organizationId: ORG,
        agentId: AGENT_ID,
        triggerType: 'manual' as const,
        triggerData: {},
        status: 'completed' as const,
        input: {},
        output: {},
        decisions: [],
        recommendations: [],
        requiresHumanApproval: false,
        correlationId: CORR_ID,
        createdAt: NOW,
        updatedAt: NOW,
      };

      const assessments = runtime.buildRiskAssessmentsFromExecution(execution);
      expect(assessments[0]?.riskScore).toBe(0);
      expect(assessments[0]?.riskLevel).toBe('low');
    });
  });
});
