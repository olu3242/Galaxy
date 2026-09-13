import type { WorkflowRequest, WorkflowTriggerSource } from '../contracts.js';

export interface WorkflowTrigger {
  id: string;
  workflowId: string;
  source: WorkflowTriggerSource;
  intent?: string;
  predicate?: (request: WorkflowRequest) => boolean;
  priority?: number;
}

export class TriggerRegistry {
  private readonly triggers = new Map<string, WorkflowTrigger>();

  register(trigger: WorkflowTrigger): void {
    if (this.triggers.has(trigger.id)) throw new Error(`Trigger already registered: ${trigger.id}`);
    this.triggers.set(trigger.id, trigger);
  }

  unregister(triggerId: string): boolean {
    return this.triggers.delete(triggerId);
  }

  list(source?: WorkflowTriggerSource): WorkflowTrigger[] {
    const triggers = [...this.triggers.values()];
    return source === undefined ? triggers : triggers.filter((item) => item.source === source);
  }

  match(request: WorkflowRequest): WorkflowTrigger[] {
    return this.list(request.source)
      .filter((trigger) => trigger.intent === undefined || trigger.intent === request.intent)
      .filter((trigger) => trigger.predicate === undefined || trigger.predicate(request))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }
}
