import type { Pool } from 'pg';
import type { AgentExecution, CopilotQuery, CopilotResponse } from '../types.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

export class OperationsCopilot {
  private readonly runtime: AgentRuntime;
  private readonly registry: AgentRegistryService;

  constructor(private readonly pool: Pool) {
    this.runtime = new AgentRuntime(pool);
    this.registry = new AgentRegistryService(pool);
  }

  async query(q: CopilotQuery): Promise<CopilotResponse> {
    let agents = await this.registry.listAgents(q.organizationId, {
      agentType: 'operations_copilot',
      isActive: true,
    });

    if (agents.length === 0) {
      const agent = await this.registry.registerAgent({
        organizationId: q.organizationId,
        name: 'Operations Copilot',
        description:
          'Workflow operations AI advisor for SLA monitoring, task routing, and process optimization',
        agentType: 'operations_copilot',
        capabilities: [
          'read_workflows',
          'write_tasks',
          'trigger_workflows',
          'assess_risk',
          'generate_recommendations',
        ],
        automationDomains: ['task', 'approval', 'incident', 'hr'],
        createdBy: 'system',
      });
      agents = [agent];
    }

    const agent = agents[0];
    if (!agent) throw new Error('No operations_copilot agent available');

    const execution = await this.runtime.execute(agent, {
      organizationId: q.organizationId,
      agentId: agent.id,
      triggerType: 'manual',
      input: {
        query: q.query,
        actorId: q.actorId,
        focusAreas: [
          'sla_monitoring',
          'workflow_bottlenecks',
          'task_routing',
          'escalation_management',
        ],
        ...(q.context ?? {}),
      },
      actorId: q.actorId,
      correlationId: q.correlationId,
    });

    const riskAssessments = this.runtime.buildRiskAssessmentsFromExecution(execution);
    const summary = this.buildOperationsSummary(execution, q.query);

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

  private buildOperationsSummary(execution: AgentExecution, query: string): string {
    const output = execution.output;
    const riskLevel = typeof output.riskLevel === 'string' ? output.riskLevel : 'low';
    const recCount =
      typeof output.recommendationCount === 'number' ? output.recommendationCount : 0;

    return (
      `Operations status for query: "${query}". ` +
      `Operational risk is ${riskLevel}. ` +
      `${String(recCount)} operational recommendation(s) generated. ` +
      (execution.requiresHumanApproval
        ? 'Escalation to operations manager required.'
        : 'Operations are within automated management parameters.')
    );
  }
}
