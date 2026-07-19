import type { Pool } from 'pg';
import type { AgentExecution, CopilotQuery, CopilotResponse } from '../types.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

export class HrCopilot {
  private readonly runtime: AgentRuntime;
  private readonly registry: AgentRegistryService;

  constructor(private readonly pool: Pool) {
    this.runtime = new AgentRuntime(pool);
    this.registry = new AgentRegistryService(pool);
  }

  async query(q: CopilotQuery): Promise<CopilotResponse> {
    let agents = await this.registry.listAgents(q.organizationId, {
      agentType: 'hr_copilot',
      isActive: true,
    });

    if (agents.length === 0) {
      const agent = await this.registry.registerAgent({
        organizationId: q.organizationId,
        name: 'HR Copilot',
        description:
          'Human resources AI advisor for leave management, member onboarding, and people operations',
        agentType: 'hr_copilot',
        capabilities: [
          'read_workflows',
          'write_tasks',
          'trigger_workflows',
          'generate_recommendations',
        ],
        automationDomains: ['hr', 'membership', 'communication'],
        createdBy: 'system',
      });
      agents = [agent];
    }

    const agent = agents[0];
    if (!agent) throw new Error('No hr_copilot agent available');

    const execution = await this.runtime.execute(agent, {
      organizationId: q.organizationId,
      agentId: agent.id,
      triggerType: 'manual',
      input: {
        query: q.query,
        actorId: q.actorId,
        focusAreas: [
          'leave_management',
          'member_onboarding',
          'attendance_tracking',
          'people_analytics',
          'policy_compliance',
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
      summary: typeof output.summary === 'string' ? output.summary : 'HR analysis complete',
      decisions: [],
      recommendations: [],
      riskAssessments: [],
      requiresHumanApproval: execution.requiresHumanApproval,
      correlationId: execution.correlationId,
    };
  }
}
