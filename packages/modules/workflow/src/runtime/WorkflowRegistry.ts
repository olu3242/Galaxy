import type { WorkflowDefinition } from '../types.js';

export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  register(definition: WorkflowDefinition): void {
    const existing = this.definitions.get(definition.id);
    if (existing && existing.version > definition.version) {
      throw new Error(`Cannot register older workflow version for ${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
  }

  registerMany(definitions: readonly WorkflowDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  unregister(workflowId: string): boolean {
    return this.definitions.delete(workflowId);
  }

  get(workflowId: string): WorkflowDefinition | undefined {
    return this.definitions.get(workflowId);
  }

  list(organizationId?: string): WorkflowDefinition[] {
    const all = [...this.definitions.values()];
    return organizationId === undefined
      ? all
      : all.filter((item) => item.organizationId === organizationId);
  }

  active(organizationId: string): WorkflowDefinition[] {
    return this.list(organizationId).filter((item) => item.isActive);
  }
}
