import type { Pool } from 'pg';
import type { AgentExecution, CopilotQuery, CopilotResponse } from '../types.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

export class ExecutiveCopilot {
  private readonly runtime: AgentRuntime;
  private readonly registry: AgentRegistryService;

  constructor(private readonly pool: Pool) {
    this.runtime = new AgentRuntime(pool);
    this.registry = new AgentRegistryService(pool);
  }

  async query(q: CopilotQuery): Promise<CopilotResponse> {
    let agents = await this.registry.listAgents(q.organizationId, {
      agentType: 'executive_copilot',
      isActive: true,
    });

    if (agents.length === 0) {
      const agent = await this.registry.registerAgent({
        organizationId: q.organizationId,
        name: 'Executive Copilot',
        description: 'C-suite AI advisor for strategic oversight, KPI review, and risk governance',
        agentType: 'executive_copilot',
        capabilities: [
          'read_workflows',
          'read_analytics',
          'assess_risk',
          'generate_recommendations',
          'approve_decisions',
        ],
        automationDomains: ['executive', 'governance', 'finance'],
        createdBy: 'system',
      });
      agents = [agent];
    }

    const agent = agents[0];
    if (!agent) throw new Error('No executive_copilot agent available');

    const execution = await this.runtime.execute(agent, {
      organizationId: q.organizationId,
      agentId: agent.id,
      triggerType: 'manual',
      input: {
        query: q.query,
        actorId: q.actorId,
        focusAreas: ['kpi_performance', 'risk_overview', 'approval_backlog', 'sla_health'],
        ...(q.context ?? {}),
      },
      actorId: q.actorId,
      correlationId: q.correlationId,
    });

    const riskAssessments = this.runtime.buildRiskAssessmentsFromExecution(execution);
    const summary = this.buildExecutiveSummary(execution, q.query);

    return {
      executionId: execution.id,
      summary,
      decisions: execution.decisions,
      recommendations: execution.recommendations,
      riskAssessments,
      requiresHumanApproval: execution.requiresHumanApproval,
      correlationId: q.correlationId,
    };
  }

  private buildExecutiveSummary(execution: AgentExecution, query: string): string {
    const output = execution.output;
    const riskScore = typeof output.riskScore === 'number' ? output.riskScore : 0;
    const riskLevel = typeof output.riskLevel === 'string' ? output.riskLevel : 'low';
    const recCount =
      typeof output.recommendationCount === 'number' ? output.recommendationCount : 0;

    return (
      `Executive briefing for query: "${query}". ` +
      `Organization risk level is ${riskLevel} (score: ${riskScore.toFixed(0)}/100). ` +
      `${String(recCount)} action item(s) identified. ` +
      (execution.requiresHumanApproval
        ? 'Human approval required before proceeding with recommended actions.'
        : 'All recommended actions are within automated governance parameters.')
    );
  }
}
