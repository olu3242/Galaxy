import type {
  WorkflowContext,
  WorkflowExecutionPlan,
  WorkflowExecutionStep,
  WorkflowExecutor,
  WorkflowRequest,
  WorkflowRuntimeHooks,
} from '../contracts.js';
import type { ContextIntelligenceEngine } from '../context/ContextIntelligenceEngine.js';
import type { WorkflowDiscoveryEngine } from '../discovery/WorkflowDiscoveryEngine.js';

const WORKFLOW_STEP_TYPES = new Set<WorkflowExecutionStep['type']>([
  'task',
  'approval',
  'notification',
  'branch',
  'delay',
  'agent',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWorkflowStepType(value: unknown): value is WorkflowExecutionStep['type'] {
  return (
    typeof value === 'string' && WORKFLOW_STEP_TYPES.has(value as WorkflowExecutionStep['type'])
  );
}

function parseSteps(definition: Record<string, unknown>): WorkflowExecutionStep[] {
  const rawSteps = definition.steps;
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps.flatMap((raw, index) => {
    if (!isRecord(raw) || !isWorkflowStepType(raw.type)) return [];
    const id = typeof raw.id === 'string' ? raw.id : `step-${String(index + 1)}`;
    const name = typeof raw.name === 'string' ? raw.name : id;
    const config = isRecord(raw.config) ? raw.config : {};
    return [{ id, name, type: raw.type, config }];
  });
}

export class WorkflowRuntime {
  constructor(
    private readonly contextEngine: ContextIntelligenceEngine,
    private readonly discoveryEngine: WorkflowDiscoveryEngine,
    private readonly executor: WorkflowExecutor,
    private readonly hooks: WorkflowRuntimeHooks = {},
  ) {}

  async handle(
    request: WorkflowRequest,
  ): Promise<{ plan: WorkflowExecutionPlan; runId: string; status: string }> {
    let context: WorkflowContext = await this.contextEngine.build(request);

    try {
      await this.hooks.onStage?.('workflow.context.ready', context);
      const matches = this.discoveryEngine.discover(context);
      context = { ...context, candidateWorkflowIds: matches.map((item) => item.workflow.id) };
      await this.hooks.onStage?.('workflow.discovery.completed', context);

      const best = matches[0];
      if (!best) throw new Error(`No workflow matched request ${request.correlationId}`);

      let steps = parseSteps(best.workflow.definition);
      if (this.hooks.dispatchAgent !== undefined) {
        steps = await Promise.all(
          steps.map(async (step) => {
            if (step.type !== 'agent') return step;
            const agentResult = await this.hooks.dispatchAgent?.(step, context);
            return { ...step, config: { ...step.config, agentResult } };
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
