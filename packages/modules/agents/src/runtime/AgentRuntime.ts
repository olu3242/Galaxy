import type { Pool } from 'pg';
import type {
  Agent,
  AgentDecision,
  AgentExecution,
  AgentExecutionStatus,
  AgentLifecycleTrace,
  AgentRuntimeState,
  ExecuteAgentInput,
  Recommendation,
  RiskAssessment,
} from '../types.js';
import { AgentContextEngine } from '../context/AgentContextEngine.js';
import { DecisionEngine } from '../decisions/DecisionEngine.js';
import { RecommendationEngine } from '../recommendations/RecommendationEngine.js';
import { RiskScoringEngine } from '../decisions/RiskScoringEngine.js';
import {
  GxContextEngine,
  GxIntentEngine,
  GxReasoningEngine,
  GxPlanningEngine,
  GxExecutionEngine,
  GxVerificationEngine,
  GxLearningEngine,
  GxOptimizationEngine,
  GxGovernanceEngine,
} from '@galaxy/cognitive-engine';
import type {
  IntentAnalysis,
  ReasoningInput,
  GovernanceCheckInput,
} from '@galaxy/cognitive-engine';
import { ALL_MANIFESTS } from '../manifests/index.js';

interface AgentExecutionRow {
  id: string;
  organization_id: string;
  agent_id: string;
  trigger_type: string;
  trigger_data: Record<string, unknown>;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decisions: AgentDecision[];
  recommendations: Recommendation[];
  risk_score: string | null;
  requires_human_approval: boolean;
  human_approved_by: string | null;
  human_approved_at: string | null;
  correlation_id: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToExecution(row: AgentExecutionRow): AgentExecution {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agentId: row.agent_id,
    triggerType: row.trigger_type as AgentExecution['triggerType'],
    triggerData: row.trigger_data,
    status: row.status as AgentExecutionStatus,
    input: row.input,
    output: row.output,
    decisions: row.decisions,
    recommendations: row.recommendations,
    requiresHumanApproval: row.requires_human_approval,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.risk_score !== null ? { riskScore: parseFloat(row.risk_score) } : {}),
    ...(row.human_approved_by !== null ? { humanApprovedBy: row.human_approved_by } : {}),
    ...(row.human_approved_at !== null ? { humanApprovedAt: row.human_approved_at } : {}),
    ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

interface StateEntry {
  state: AgentRuntimeState;
  enteredAt: string;
  durationMs?: number;
}

function buildTrace(
  executionId: string,
  agentId: string,
  states: StateEntry[],
  startMs: number,
  extras: {
    intentAnalysis?: unknown;
    reasoningTrace?: unknown;
    planSummary?: unknown;
    verificationResult?: unknown;
    governanceDecision?: unknown;
    learningEventId?: string;
  },
): AgentLifecycleTrace {
  const trace: AgentLifecycleTrace = {
    executionId,
    agentId,
    states,
    totalDurationMs: Date.now() - startMs,
  };
  if (extras.intentAnalysis !== undefined) trace.intentAnalysis = extras.intentAnalysis;
  if (extras.reasoningTrace !== undefined) trace.reasoningTrace = extras.reasoningTrace;
  if (extras.planSummary !== undefined) trace.planSummary = extras.planSummary;
  if (extras.verificationResult !== undefined) trace.verificationResult = extras.verificationResult;
  if (extras.governanceDecision !== undefined) trace.governanceDecision = extras.governanceDecision;
  if (extras.learningEventId !== undefined) trace.learningEventId = extras.learningEventId;
  return trace;
}

export class AgentRuntime {
  private readonly contextEngine: AgentContextEngine;
  private readonly decisionEngine: DecisionEngine;
  private readonly recommendationEngine: RecommendationEngine;
  private readonly riskEngine: RiskScoringEngine;

  // GX cognitive engines
  private readonly gxContext: GxContextEngine;
  private readonly gxIntent: GxIntentEngine;
  private readonly gxReasoning: GxReasoningEngine;
  private readonly gxPlanning: GxPlanningEngine;
  private readonly gxExecution: GxExecutionEngine;
  private readonly gxVerification: GxVerificationEngine;
  private readonly gxLearning: GxLearningEngine;
  private readonly gxOptimization: GxOptimizationEngine;
  private readonly gxGovernance: GxGovernanceEngine;

  constructor(private readonly pool: Pool) {
    this.contextEngine = new AgentContextEngine(pool);
    this.decisionEngine = new DecisionEngine(pool);
    this.recommendationEngine = new RecommendationEngine();
    this.riskEngine = new RiskScoringEngine(pool);

    this.gxContext = new GxContextEngine(pool);
    this.gxIntent = new GxIntentEngine();
    this.gxReasoning = new GxReasoningEngine();
    this.gxPlanning = new GxPlanningEngine();
    this.gxExecution = new GxExecutionEngine(pool);
    this.gxVerification = new GxVerificationEngine();
    this.gxLearning = new GxLearningEngine(pool);
    this.gxOptimization = new GxOptimizationEngine(pool);
    this.gxGovernance = new GxGovernanceEngine(pool);
  }

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async execute(agent: Agent, input: ExecuteAgentInput): Promise<AgentExecution> {
    await this.setTenantContext(input.organizationId);

    const execResult = await this.pool.query<AgentExecutionRow>(
      `INSERT INTO agent_executions
         (organization_id, agent_id, trigger_type, trigger_data, status, input, correlation_id, started_at)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW())
       RETURNING *`,
      [
        input.organizationId,
        agent.id,
        input.triggerType,
        JSON.stringify(input.triggerData ?? {}),
        JSON.stringify(input.input),
        input.correlationId,
      ],
    );

    const execRow = execResult.rows[0];
    if (!execRow) throw new Error('INSERT INTO agent_executions returned no row');
    const executionId = execRow.id;

    const startMs = Date.now();
    const states: StateEntry[] = [];
    let lastStateEnteredAt = new Date().toISOString();
    let lastStateMs = Date.now();

    const transitionState = (next: AgentRuntimeState): void => {
      const now = Date.now();
      const last = states[states.length - 1];
      if (last !== undefined) {
        last.durationMs = now - lastStateMs;
      }
      lastStateEnteredAt = new Date().toISOString();
      lastStateMs = now;
      states.push({ state: next, enteredAt: lastStateEnteredAt });
    };

    // Suppress unused variable warning — lastStateEnteredAt is used by transitionState
    void lastStateEnteredAt;

    const manifest = ALL_MANIFESTS.find((m) => m.agentType === agent.agentType);

    try {
      // STAGE 1 — OBSERVE
      transitionState('OBSERVING');
      const agentContext = await this.gxContext.enrich({
        tenantId: input.organizationId,
        actorId: input.actorId,
        organizationId: input.organizationId,
        sessionMetadata: { correlationId: input.correlationId },
      });

      // STAGE 2 — UNDERSTAND
      transitionState('UNDERSTANDING');
      const rawInput = JSON.stringify(input.input);
      const intentAnalysis: IntentAnalysis = this.gxIntent.analyze(rawInput);

      // STAGE 3 — REASON (THINKING)
      transitionState('THINKING');
      const contextFacts: Record<string, unknown> = {
        organizationId: agentContext.organizationId,
        memberRole: agentContext.memberRole,
        activeWorkflows: agentContext.activeWorkflows,
        pendingApprovals: agentContext.pendingApprovals,
      };
      const reasoningInput: ReasoningInput = {
        question: intentAnalysis.goal.description,
        contextFacts,
      };
      if (manifest?.defaultStrategy !== undefined) {
        reasoningInput.strategy = manifest.defaultStrategy;
      }
      const reasoningTrace = this.gxReasoning.reason(reasoningInput);

      // STAGE 4 — PLAN
      transitionState('PLANNING');
      const plan = this.gxPlanning.createPlan({
        goal: intentAnalysis.goal.description,
        organizationId: input.organizationId,
      });

      // STAGE 5 — GOVERNANCE CHECK (before execution)
      const governanceCheckInput: GovernanceCheckInput = {
        organizationId: input.organizationId,
        actorId: input.actorId,
        agentId: agent.id,
        action: intentAnalysis.intent,
        resourceType: 'agent_execution',
        impactTier: manifest?.impactTier ?? 3,
      };
      const governanceDecision = await this.gxGovernance.evaluate(governanceCheckInput);

      if (governanceDecision.humanApprovalRequired) {
        transitionState('WAITING');
        const trace = buildTrace(executionId, agent.id, states, startMs, {
          intentAnalysis,
          reasoningTrace,
          planSummary: { goal: plan.goal, taskCount: plan.tasks.length },
          governanceDecision,
        });

        const waitOutput: Record<string, unknown> = {
          lifecycleTrace: trace,
          governanceReason: governanceDecision.reason,
          riskLevel: governanceDecision.riskLevel,
        };

        const waitResult = await this.pool.query<AgentExecutionRow>(
          `UPDATE agent_executions
           SET status = 'awaiting_human', output = $2, requires_human_approval = true,
               updated_at = NOW()
           WHERE organization_id = $3 AND id = $1
           RETURNING *`,
          [executionId, JSON.stringify(waitOutput), input.organizationId],
        );
        const waitRow = waitResult.rows[0];
        if (!waitRow) throw new Error('Failed to update execution to awaiting_human');
        return rowToExecution(waitRow);
      }

      // STAGE 6 — EXECUTE
      transitionState('EXECUTING');

      // Legacy engines — backward compat
      const context = await this.contextEngine.buildContext(
        input.organizationId,
        agent.id,
        executionId,
        { automationDomains: agent.automationDomains },
      );
      const contextData = context.contextData;

      const riskAssessment = await this.riskEngine.assessRisk(
        input.organizationId,
        agent.id,
        { subjectType: 'action', subjectId: executionId, data: { ...input.input, ...contextData } },
        input.correlationId,
        executionId,
      );

      const rules = await this.decisionEngine.loadRules(
        input.organizationId,
        agent.automationDomains[0],
      );
      const evalResult = this.decisionEngine.evaluate(
        rules,
        { ...input.input, ...contextData },
        riskAssessment.riskScore,
      );
      const decision = await this.decisionEngine.recordDecision(
        input.organizationId,
        agent.id,
        'action',
        `Agent execution: ${agent.name}`,
        { ...input.input, ...contextData },
        evalResult.outcome,
        evalResult.confidence,
        evalResult.reasoning,
        evalResult.matchedRuleIds,
        input.correlationId,
        executionId,
      );
      const recommendations = this.recommendationEngine.generate(context, riskAssessment.riskScore);

      // GX execution engine — run plan
      const executionResults = await this.gxExecution.executePlan(plan, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        correlationId: input.correlationId,
        pool: this.pool,
      });

      // STAGE 7 — VERIFY
      transitionState('VERIFYING');
      const planOutput: Record<string, unknown> = {
        decisionOutcome: decision.outcome,
        confidenceScore: decision.confidenceScore,
        riskScore: riskAssessment.riskScore,
        riskLevel: riskAssessment.riskLevel,
        recommendationCount: recommendations.length,
        executionResults,
      };
      const verificationResult = this.gxVerification.verify({ output: planOutput });

      // STAGE 8 — LEARN
      transitionState('LEARNING');
      const success =
        verificationResult.status === 'passed' || verificationResult.status === 'warning';
      await this.gxLearning.recordOutcome({
        agentId: agent.id,
        organizationId: input.organizationId,
        executionId,
        outcome: success ? 'success' : 'failure',
        intent: intentAnalysis.intent,
        actions: intentAnalysis.predictedActions,
        durationMs: Date.now() - startMs,
        confidenceScore: verificationResult.confidenceScore,
        humanEscalated: false,
      });

      // STAGE 9 — OPTIMIZE (fire-and-forget)
      transitionState('OPTIMIZING');
      this.gxOptimization.detectBottlenecks(agent.id, input.organizationId).catch(() => {
        /* best-effort */
      });

      // REPORT
      const requiresHumanApproval =
        decision.requiresHumanOverride ||
        riskAssessment.riskLevel === 'critical' ||
        verificationResult.requiresHumanReview;

      const finalStatus: AgentExecutionStatus = requiresHumanApproval
        ? 'awaiting_human'
        : 'completed';
      transitionState(requiresHumanApproval ? 'ESCALATED' : 'COMPLETED');

      const trace = buildTrace(executionId, agent.id, states, startMs, {
        intentAnalysis,
        reasoningTrace,
        planSummary: { goal: plan.goal, taskCount: plan.tasks.length, complexity: plan.complexity },
        verificationResult,
        governanceDecision,
      });

      const output: Record<string, unknown> = {
        ...planOutput,
        lifecycleTrace: trace,
      };

      const updateResult = await this.pool.query<AgentExecutionRow>(
        `UPDATE agent_executions
         SET status = $2, output = $3, decisions = $4, recommendations = $5,
             risk_score = $6, requires_human_approval = $7,
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE organization_id = $8 AND id = $1
         RETURNING *`,
        [
          executionId,
          finalStatus,
          JSON.stringify(output),
          JSON.stringify([decision]),
          JSON.stringify(recommendations),
          riskAssessment.riskScore.toFixed(2),
          requiresHumanApproval,
          input.organizationId,
        ],
      );

      const updated = updateResult.rows[0];
      if (!updated) throw new Error('Failed to update agent execution');
      return rowToExecution(updated);
    } catch (err) {
      transitionState('FAILED');
      await this.pool.query(
        `UPDATE agent_executions SET status = 'failed', updated_at = NOW()
         WHERE organization_id = $1 AND id = $2`,
        [input.organizationId, executionId],
      );
      throw err;
    }
  }

  async getExecution(organizationId: string, executionId: string): Promise<AgentExecution | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AgentExecutionRow>(
      `SELECT * FROM agent_executions WHERE organization_id = $1 AND id = $2`,
      [organizationId, executionId],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToExecution(row) : null;
  }

  async listExecutions(
    organizationId: string,
    opts?: { agentId?: string; status?: AgentExecutionStatus; limit?: number },
  ): Promise<AgentExecution[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (opts?.agentId !== undefined) {
      conditions.push(`agent_id = $${String(idx)}`);
      params.push(opts.agentId);
      idx++;
    }
    if (opts?.status !== undefined) {
      conditions.push(`status = $${String(idx)}`);
      params.push(opts.status);
      idx++;
    }
    params.push(opts?.limit ?? 50);
    const result = await this.pool.query<AgentExecutionRow>(
      `SELECT * FROM agent_executions WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${String(idx)}`,
      params,
    );
    return result.rows.map(rowToExecution);
  }

  async approveExecution(
    organizationId: string,
    executionId: string,
    actorId: string,
  ): Promise<AgentExecution> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AgentExecutionRow>(
      `UPDATE agent_executions
       SET status = 'completed', human_approved_by = $3, human_approved_at = NOW(),
           requires_human_approval = false, completed_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [organizationId, executionId, actorId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Execution not found: ${executionId}`);
    return rowToExecution(row);
  }

  buildRiskAssessmentsFromExecution(execution: AgentExecution): RiskAssessment[] {
    const score = execution.riskScore ?? 0;
    return [
      {
        id: crypto.randomUUID(),
        organizationId: execution.organizationId,
        agentId: execution.agentId,
        executionId: execution.id,
        subjectType: 'action',
        subjectId: execution.id,
        riskScore: score,
        riskLevel: score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low',
        riskFactors: [],
        correlationId: execution.correlationId,
        createdAt: execution.createdAt,
      },
    ];
  }
}
