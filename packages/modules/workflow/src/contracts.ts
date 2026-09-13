import type { AutomationDomain, FlowType, WorkflowDefinition, WorkflowRunStatus } from './types.js';

export type WorkflowTriggerSource = 'whatsapp' | 'web' | 'api' | 'scheduler' | 'event';

export interface WorkflowRequest {
  organizationId: string;
  source: WorkflowTriggerSource;
  sourceId?: string;
  actorId?: string;
  rawInput?: string;
  intent?: string;
  automationDomain?: AutomationDomain;
  flowType?: FlowType;
  payload: Record<string, unknown>;
  correlationId: string;
  receivedAt: string;
}

export interface WorkflowContext {
  request: WorkflowRequest;
  attributes: Record<string, unknown>;
  candidateWorkflowIds: string[];
  requiresHumanReview: boolean;
}

export interface WorkflowExecutionStep {
  id: string;
  type: 'task' | 'approval' | 'notification' | 'branch' | 'delay' | 'agent';
  name: string;
  config: Record<string, unknown>;
}

export interface WorkflowExecutionPlan {
  workflowId: string;
  workflowVersion: number;
  correlationId: string;
  steps: WorkflowExecutionStep[];
  context: WorkflowContext;
}

export interface WorkflowMatch {
  workflow: WorkflowDefinition;
  score: number;
  reasons: string[];
}

export interface WorkflowExecutor {
  execute(plan: WorkflowExecutionPlan): Promise<{ runId: string; status: WorkflowRunStatus }>;
}

export interface WorkflowRuntimeHooks {
  onStage?(stage: string, context: WorkflowContext): Promise<void> | void;
  onError?(stage: string, error: unknown, context: WorkflowContext): Promise<void> | void;
  dispatchAgent?(
    step: WorkflowExecutionStep,
    context: WorkflowContext,
  ): Promise<Record<string, unknown>>;
}
