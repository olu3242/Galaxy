import type { WorkflowContext, WorkflowMatch } from '../contracts.js';
import { WorkflowRegistry } from '../runtime/WorkflowRegistry.js';
import { TriggerRegistry } from '../triggers/TriggerRegistry.js';

export class WorkflowDiscoveryEngine {
  constructor(
    private readonly workflows: WorkflowRegistry,
    private readonly triggers: TriggerRegistry,
  ) {}

  discover(context: WorkflowContext): WorkflowMatch[] {
    const request = context.request;
    const triggerMatches = this.triggers.match(request);
    const triggerByWorkflow = new Map(triggerMatches.map((trigger) => [trigger.workflowId, trigger]));

    return this.workflows
      .active(request.organizationId)
      .map((workflow): WorkflowMatch => {
        let score = 0;
        const reasons: string[] = [];
        const trigger = triggerByWorkflow.get(workflow.id);

        if (trigger) {
          score += 60 + (trigger.priority ?? 0);
          reasons.push(`trigger:${trigger.id}`);
        }
        if (request.intent) {
          const needle = request.intent.toLowerCase();
          if (workflow.name.toLowerCase().includes(needle) || workflow.tags.some((tag) => tag.toLowerCase() === needle)) {
            score += 25;
            reasons.push('intent');
          }
        }
        if (request.automationDomain && workflow.automationDomain === request.automationDomain) {
          score += 10;
          reasons.push('domain');
        }
        if (request.flowType && workflow.flowType === request.flowType) {
          score += 5;
          reasons.push('flow');
        }

        return { workflow, score, reasons };
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || b.workflow.version - a.workflow.version);
  }
}
