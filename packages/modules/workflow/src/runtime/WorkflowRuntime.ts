import type {
  WorkflowContext,
  WorkflowExecutionPlan,
  WorkflowExecutionStep,
  WorkflowExecutor,
  WorkflowRequest,
  WorkflowRuntimeHooks,
} from '../contracts.js';
import { ContextIntelligenceEngine } from '../context/ContextIntelligenceEngine.js';
import { WorkflowDiscoveryEngine } from '../discovery/WorkflowDiscoveryEngine.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSteps(definition: Record<string, unknown>): WorkflowExecutionStep[] {
  const rawSteps = definition.steps;
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];
    const type = raw.type;
    if (!['task', 'approval', 'notification', 'branch', 'delay', 'agent'].includes(String(type))) return [];
    const id = typeof raw.id === 'string' ? raw.id : `step-${index + 1}`;
    const name = typeof raw.name === 'string' ? raw.name : id;
    const config = isRecord(raw.config) ? raw.config : {};
    return [{ id, name, type: type as WorkflowExecutionStep['type'], config }];
  });
}

export class WorkflowRuntime {
  constructor(
    private readonly contextEngine: ContextIntelligenceEngine,
    private readonly discoveryEngine: WorkflowDiscoveryEngine,
    private readonly executor: WorkflowExecutor,
    private readonly hooks: WorkflowRuntimeHooks = {},
  ) {}

  async handle(request: WorkflowRequest): Promise<{ plan: WorkflowExecutionPlan; runId: string; status: string }> {
    let context: WorkflowContext = await this.contextEngine.build(request);

    try {
      await this.hooks.onStage?.('workflow.context.ready', context);
      const matches = this.discoveryEngine.discover(context);
      context = { ...context, candidateWorkflowIds: matches.map((item) => item.workflow.id) };
      await this.hooks.onStage?.('workflow.discovery.completed', context);

      const best = matches[0];
      if (!best) throw new Error(`No workflow matched request ${request.correlationId}`);

      let steps = parseSteps(best.workflow.definition);
      if (this.hooks.dispatchAgent) {
        steps = await Promise.all(
          steps.map(async (step) => {
            if (step.type !== 'agent') return step;
            const agentResult = await this.hooks.dispatchAgent?.(step, context);
            return { ...step, config: { ...step.config, agentResult: agentResult ?? {} } };
          }),
        );
      }

      const plan: WorkflowExecutionPlan = {
        workflowId: best.workflow.id,
        workflowVersion: best.workflow.version,
        correlationId: request.correlationId,
        steps,
        context,
      };

      await this.hooks.onStage?.('workflow.plan.ready', context);
      const result = await this.executor.execute(plan);
      await this.hooks.onStage?.('workflow.execution.dispatched', context);
      return { plan, runId: result.runId, status: result.status };
    } catch (error) {
      await this.hooks.onError?.('workflow.runtime.failed', error, context);
      throw error;
    }
  }
}
