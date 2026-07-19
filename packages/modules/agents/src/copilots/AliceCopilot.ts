import type { Pool } from 'pg';
import type { AgentExecution, CopilotQuery, CopilotResponse } from '../types.js';
import { AgentRuntime } from '../runtime/AgentRuntime.js';
import { AgentRegistryService } from '../registry/AgentRegistryService.js';

/**
 * AliceCopilot — ALICE (Autonomous Leadership & Intelligence Command Engine).
 *
 * ALICE is the executive intelligence layer: she synthesises organisation-wide
 * signals, surfaces strategic recommendations, orchestrates other agents, and
 * provides the CEO / board with a single pane of glass over the entire OS.
 */
export class AliceCopilot {
  private readonly runtime: AgentRuntime;
  private readonly registry: AgentRegistryService;

  constructor(private readonly pool: Pool) {
    this.runtime = new AgentRuntime(pool);
    this.registry = new AgentRegistryService(pool);
  }

  async query(q: CopilotQuery): Promise<CopilotResponse> {
    let agents = await this.registry.listAgents(q.organizationId, {
      agentType: 'alice',
      isActive: true,
    });

    if (agents.length === 0) {
      const agent = await this.registry.registerAgent({
        organizationId: q.organizationId,
        name: 'ALICE',
        description:
          'Autonomous Leadership & Intelligence Command Engine — executive AI brain for Galaxy OS',
        agentType: 'alice',
        capabilities: [
          'read_workflows',
          'read_analytics',
          'read_knowledge',
          'write_tasks',
          'trigger_workflows',
          'approve_decisions',
          'assess_risk',
          'generate_recommendations',
        ],
        automationDomains: ['executive', 'governance', 'operations', 'finance', 'people'],
        createdBy: 'system',
      });
      agents = [agent];
    }

    const agent = agents[0];
    if (!agent) throw new Error('No ALICE agent available');

    const execution = await this.runtime.execute(agent, {
      organizationId: q.organizationId,
      agentId: agent.id,
      triggerType: 'manual',
      input: {
        query: q.query,
        actorId: q.actorId,
        focusAreas: [
          'organisation_health',
          'kpi_performance',
          'risk_overview',
          'approval_backlog',
          'sla_health',
          'strategic_priorities',
          'team_capacity',
        ],
        ...(q.context ?? {}),
      },
      actorId: q.actorId,
      correlationId: q.correlationId,
    });

    const riskAssessments = this.runtime.buildRiskAssessmentsFromExecution(execution);
    const summary = this.buildAliceSummary(execution, q.query);

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

  private buildAliceSummary(execution: AgentExecution, query: string): string {
    const output = execution.output;
    const riskScore = typeof output.riskScore === 'number' ? output.riskScore : 0;
    const riskLevel = typeof output.riskLevel === 'string' ? output.riskLevel : 'low';
    const recCount =
      typeof output.recommendationCount === 'number' ? output.recommendationCount : 0;
    const approvalPending =
      typeof output.approvalsPending === 'number' ? output.approvalsPending : 0;

    const recSuffix = recCount !== 1 ? 's' : '';
    const appSuffix = approvalPending !== 1 ? 's' : '';
    const humanMsg = execution.requiresHumanApproval
      ? 'Human review required before proceeding.'
      : 'No immediate human action required.';

    return (
      `ALICE intelligence briefing for: "${query}". ` +
      `Organisation risk posture is ${riskLevel} (score: ${riskScore.toFixed(0)}/100). ` +
      `${String(recCount)} strategic recommendation${recSuffix} surfaced. ` +
      `${String(approvalPending)} item${appSuffix} pending executive approval. ` +
      humanMsg
    );
  }
}
