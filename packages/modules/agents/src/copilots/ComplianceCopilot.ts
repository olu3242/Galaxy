import type { Pool } from 'pg';
import type { AgentExecution, CopilotQuery, CopilotResponse } from '../types.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

export class ComplianceCopilot {
  private readonly runtime: AgentRuntime;
  private readonly registry: AgentRegistryService;

  constructor(private readonly pool: Pool) {
    this.runtime = new AgentRuntime(pool);
    this.registry = new AgentRegistryService(pool);
  }

  async query(q: CopilotQuery): Promise<CopilotResponse> {
    let agents = await this.registry.listAgents(q.organizationId, {
      agentType: 'compliance_copilot',
      isActive: true,
    });

    if (agents.length === 0) {
      const agent = await this.registry.registerAgent({
        organizationId: q.organizationId,
        name: 'Compliance Copilot',
        description:
          'Compliance and governance AI advisor for audit trails, policy enforcement, and regulatory alignment',
        agentType: 'compliance_copilot',
        capabilities: [
          'read_workflows',
          'read_analytics',
          'read_knowledge',
          'assess_risk',
          'generate_recommendations',
          'approve_decisions',
        ],
        automationDomains: ['governance', 'finance', 'membership'],
        createdBy: 'system',
      });
      agents = [agent];
    }

    const agent = agents[0];
    if (!agent) throw new Error('No compliance_copilot agent available');

    const execution = await this.runtime.execute(agent, {
      organizationId: q.organizationId,
      agentId: agent.id,
      triggerType: 'manual',
      input: {
        query: q.query,
        actorId: q.actorId,
        focusAreas: ['audit_trail', 'policy_compliance', 'approval_governance', 'risk_mitigation'],
        ...(q.context ?? {}),
      },
      actorId: q.actorId,
      correlationId: q.correlationId,
    });

    const riskAssessments = this.runtime.buildRiskAssessmentsFromExecution(execution);
    const summary = this.buildComplianceSummary(execution, q.query);

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

  private buildComplianceSummary(execution: AgentExecution, query: string): string {
    const output = execution.output;
    const riskLevel = typeof output.riskLevel === 'string' ? output.riskLevel : 'low';
    const riskScore = typeof output.riskScore === 'number' ? output.riskScore : 0;

    return (
      `Compliance assessment for query: "${query}". ` +
      `Compliance risk level: ${riskLevel} (score: ${riskScore.toFixed(0)}/100). ` +
      (execution.requiresHumanApproval
        ? 'Compliance officer review required — automated thresholds exceeded.'
        : 'Organization is within compliance parameters. No immediate action required.')
    );
  }
}
