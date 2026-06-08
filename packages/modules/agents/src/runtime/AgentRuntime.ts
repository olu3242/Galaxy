import type { Pool } from 'pg';
import type {
  Agent,
  AgentDecision,
  AgentExecution,
  AgentExecutionStatus,
  ExecuteAgentInput,
  Recommendation,
  RiskAssessment,
} from '../types.js';
import { AgentContextEngine } from '../context/AgentContextEngine.js';
import { DecisionEngine } from '../decisions/DecisionEngine.js';
import { RecommendationEngine } from '../recommendations/RecommendationEngine.js';
import { RiskScoringEngine } from '../decisions/RiskScoringEngine.js';

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

export class AgentRuntime {
  private readonly contextEngine: AgentContextEngine;
  private readonly decisionEngine: DecisionEngine;
  private readonly recommendationEngine: RecommendationEngine;
  private readonly riskEngine: RiskScoringEngine;

  constructor(private readonly pool: Pool) {
    this.contextEngine = new AgentContextEngine(pool);
    this.decisionEngine = new DecisionEngine(pool);
    this.recommendationEngine = new RecommendationEngine();
    this.riskEngine = new RiskScoringEngine(pool);
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

    try {
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

      const requiresHumanApproval =
        decision.requiresHumanOverride || riskAssessment.riskLevel === 'critical';

      const finalStatus: AgentExecutionStatus = requiresHumanApproval
        ? 'awaiting_human'
        : 'completed';

      const output: Record<string, unknown> = {
        decisionOutcome: decision.outcome,
        confidenceScore: decision.confidenceScore,
        riskScore: riskAssessment.riskScore,
        riskLevel: riskAssessment.riskLevel,
        recommendationCount: recommendations.length,
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
