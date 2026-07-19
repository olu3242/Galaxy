import type { Pool } from 'pg';
import type { AgentExecution, CopilotQuery, CopilotResponse } from '../types.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

export class FinanceCopilot {
  private readonly runtime: AgentRuntime;
  private readonly registry: AgentRegistryService;

  constructor(private readonly pool: Pool) {
    this.runtime = new AgentRuntime(pool);
    this.registry = new AgentRegistryService(pool);
  }

  async query(q: CopilotQuery): Promise<CopilotResponse> {
    let agents = await this.registry.listAgents(q.organizationId, {
      agentType: 'finance_copilot',
      isActive: true,
    });

    if (agents.length === 0) {
      const agent = await this.registry.registerAgent({
        organizationId: q.organizationId,
        name: 'Finance Copilot',
        description:
          'Finance AI advisor for expense approvals, budget tracking, and financial compliance',
        agentType: 'finance_copilot',
        capabilities: [
          'read_workflows',
          'write_tasks',
          'trigger_workflows',
          'assess_risk',
          'generate_recommendations',
        ],
        automationDomains: ['finance', 'approval', 'governance'],
        createdBy: 'system',
      });
      agents = [agent];
    }

    const agent = agents[0];
    if (!agent) throw new Error('No finance_copilot agent available');

    const execution = await this.runtime.execute(agent, {
      organizationId: q.organizationId,
      agentId: agent.id,
      triggerType: 'manual',
      input: {
        query: q.query,
        actorId: q.actorId,
        focusAreas: [
          'expense_approvals',
          'budget_variance',
          'payment_compliance',
          'financial_risk',
          'audit_trail',
        ],
        ...(q.context ?? {}),
      },
      actorId: q.actorId,
      correlationId: q.correlationId,
    });

    return this.buildResponse(execution);
  }

  private buildResponse(execution: AgentExecution): CopilotResponse {
    const output = execution.output;
    return {
      executionId: execution.id,
      summary: typeof output.summary === 'string' ? output.summary : 'Finance analysis complete',
      decisions: [],
      recommendations: [],
      riskAssessments: [],
      requiresHumanApproval: execution.requiresHumanApproval,
      correlationId: execution.correlationId,
    };
  }
}
