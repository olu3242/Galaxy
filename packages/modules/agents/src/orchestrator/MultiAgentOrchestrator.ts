import type { Pool } from 'pg';
import type { Agent, AgentExecution, AgentExecutionStatus, AgentType } from '../types.js';
import type { AgentRuntime } from '../runtime/AgentRuntime.js';
import { GxIntentEngine, type IntentCategory } from '@galaxy/cognitive-engine';

export interface OrchestrationTask {
  id: string;
  parentTaskId?: string;
  organizationId: string;
  requestedAgentType: AgentType;
  input: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  correlationId: string;
  actorId: string;
  triggerType: AgentExecution['triggerType'];
}

export interface OrchestrationResult {
  taskId: string;
  agentType: AgentType;
  executionId: string;
  status: AgentExecutionStatus;
  output: Record<string, unknown>;
  requiresHumanApproval: boolean;
  durationMs: number;
}

export interface OrchestrationPlan {
  correlationId: string;
  tasks: OrchestrationTask[];
  executionOrder: string[][];
  estimatedAgentCount: number;
}

interface AgentConfigRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  agent_type: string;
  capabilities: string[];
  automation_domains: string[];
  config: Record<string, unknown>;
  is_active: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToAgent(row: AgentConfigRow): Agent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    agentType: row.agent_type as AgentType,
    capabilities: row.capabilities as Agent['capabilities'],
    automationDomains: row.automation_domains,
    config: row.config,
    isActive: row.is_active,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.description !== null ? { description: row.description } : {}),
  };
}

const INTENT_TO_AGENT_TYPES: Record<IntentCategory, AgentType[]> = {
  query_information: ['alice', 'nova'],
  trigger_workflow: ['max', 'atlas'],
  approve_request: ['guardian', 'eva'],
  escalate_issue: ['guardian', 'aurora'],
  generate_report: ['nova', 'sage'],
  manage_member: ['finn', 'lyra'],
  configure_system: ['titan', 'mercury'],
  assess_risk: ['eva', 'apollo'],
  unknown: ['alice'],
};

export class MultiAgentOrchestrator {
  private readonly gxIntent: GxIntentEngine;

  constructor(
    private readonly pool: Pool,
    private readonly runtime: AgentRuntime,
  ) {
    this.gxIntent = new GxIntentEngine();
  }

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  private async resolveAgent(organizationId: string, agentType: AgentType): Promise<Agent | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AgentConfigRow>(
      `SELECT * FROM agent_configs
       WHERE organization_id = $1 AND agent_type = $2 AND is_active = true
       LIMIT 1`,
      [organizationId, agentType],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToAgent(row) : null;
  }

  planFromGoal(
    goal: string,
    organizationId: string,
    actorId: string,
    correlationId: string,
  ): OrchestrationPlan {
    const intentAnalysis = this.gxIntent.analyze(goal);
    const agentTypes = INTENT_TO_AGENT_TYPES[intentAnalysis.intent];

    const tasks: OrchestrationTask[] = agentTypes.map((agentType) => ({
      id: crypto.randomUUID(),
      organizationId,
      requestedAgentType: agentType,
      input: { goal, intent: intentAnalysis.intent, entities: intentAnalysis.entities },
      priority: intentAnalysis.goal.priority,
      correlationId,
      actorId,
      triggerType: 'manual' as const,
    }));

    const taskIds = tasks.map((t) => t.id);

    return {
      correlationId,
      tasks,
      executionOrder: [taskIds],
      estimatedAgentCount: agentTypes.length,
    };
  }

  async orchestrate(plan: OrchestrationPlan): Promise<OrchestrationResult[]> {
    const results: OrchestrationResult[] = [];

    for (const batch of plan.executionOrder) {
      const batchTasks = batch
        .map((taskId) => plan.tasks.find((t) => t.id === taskId))
        .filter((t): t is OrchestrationTask => t !== undefined);

      const batchResults = await Promise.all(batchTasks.map((task) => this.executeTask(task)));

      results.push(...batchResults);
    }

    return results;
  }

  private async executeTask(task: OrchestrationTask): Promise<OrchestrationResult> {
    const startMs = Date.now();

    const agent = await this.resolveAgent(task.organizationId, task.requestedAgentType);

    if (agent === null) {
      return {
        taskId: task.id,
        agentType: task.requestedAgentType,
        executionId: crypto.randomUUID(),
        status: 'failed',
        output: {
          error: `No active agent of type '${task.requestedAgentType}' found for organization`,
        },
        requiresHumanApproval: false,
        durationMs: Date.now() - startMs,
      };
    }

    const execution = await this.runtime.execute(agent, {
      organizationId: task.organizationId,
      agentId: agent.id,
      triggerType: task.triggerType,
      triggerData: task.parentTaskId !== undefined ? { parentTaskId: task.parentTaskId } : {},
      input: task.input,
      actorId: task.actorId,
      correlationId: task.correlationId,
    });

    return {
      taskId: task.id,
      agentType: task.requestedAgentType,
      executionId: execution.id,
      status: execution.status,
      output: execution.output,
      requiresHumanApproval: execution.requiresHumanApproval,
      durationMs: Date.now() - startMs,
    };
  }
}
