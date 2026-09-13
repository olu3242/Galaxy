import type { WorkflowContext, WorkflowRequest } from '../contracts.js';

export interface ContextProvider {
  name: string;
  enrich(request: WorkflowRequest, current: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>;
}

export class ContextIntelligenceEngine {
  constructor(private readonly providers: readonly ContextProvider[] = []) {}

  async build(request: WorkflowRequest): Promise<WorkflowContext> {
    let attributes: Record<string, unknown> = {};
    for (const provider of this.providers) {
      const enrichment = await provider.enrich(request, attributes);
      attributes = { ...attributes, ...enrichment };
    }

    return {
      request,
      attributes,
      candidateWorkflowIds: [],
      requiresHumanReview: false,
    };
  }
}
