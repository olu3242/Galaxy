export type AutomationDomain =
  | 'communication'
  | 'task'
  | 'approval'
  | 'incident'
  | 'membership'
  | 'event'
  | 'hr'
  | 'finance'
  | 'knowledge'
  | 'governance'
  | 'executive';

export type FlowType = 'screen_flow' | 'record_trigger' | 'scheduled' | 'automated' | 'ai_flow';

export type WorkflowStatus = 'draft' | 'published' | 'deprecated';

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'escalated'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';

export interface WorkflowDefinition {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  version: number;
  isActive: boolean;
  automationDomain: AutomationDomain;
  flowType: FlowType;
  ownerId?: string;
  departmentId?: string;
  slaDurationHours?: number;
  tags: string[];
  definition: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  organizationId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  currentStepId?: string;
  triggeredBy: string;
  triggerData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  correlationId: string;
  slaDueAt?: string;
  escalatedAt?: string;
  automationDomain?: AutomationDomain;
  flowType?: FlowType;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  organizationId: string;
  workflowRunId?: string;
  title: string;
  description?: string;
  status: ApprovalStatus;
  requestedBy: string;
  currentStepOrder: number;
  dueAt?: string;
  completedAt?: string;
  data: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStep {
  id: string;
  organizationId: string;
  approvalId: string;
  stepOrder: number;
  approverId: string;
  approverType: 'member' | 'role' | 'department_head';
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  dueAt?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  organizationId: string;
  workflowRunId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  reporterId: string;
  dueAt?: string;
  completedAt?: string;
  correlationId: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IntentDetection {
  id: string;
  organizationId: string;
  sourceType: 'whatsapp' | 'api' | 'web' | 'scheduled';
  sourceId?: string;
  rawInput: string;
  detectedIntent: string;
  automationDomain?: AutomationDomain;
  flowType?: FlowType;
  matchedWorkflowId?: string;
  workflowRunId?: string;
  confidenceScore?: number;
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface CreateWorkflowInput {
  organizationId: string;
  name: string;
  description?: string;
  automationDomain: AutomationDomain;
  flowType: FlowType;
  ownerId?: string;
  departmentId?: string;
  slaDurationHours?: number;
  tags?: string[];
  definition?: Record<string, unknown>;
  createdBy: string;
  correlationId: string;
}

export interface StartWorkflowInput {
  organizationId: string;
  workflowId: string;
  triggeredBy: string;
  triggerData: Record<string, unknown>;
  correlationId: string;
}

export interface CreateApprovalInput {
  organizationId: string;
  workflowRunId?: string;
  title: string;
  description?: string;
  requestedBy: string;
  steps: {
    approverId: string;
    approverType: 'member' | 'role' | 'department_head';
    dueAt?: string;
  }[];
  dueAt?: string;
  data?: Record<string, unknown>;
  correlationId: string;
}

export interface ApprovalDecisionInput {
  organizationId: string;
  approvalId: string;
  stepId: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  correlationId: string;
}

export interface CreateTaskInput {
  organizationId: string;
  workflowRunId?: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  reporterId: string;
  dueAt?: string;
  data?: Record<string, unknown>;
  correlationId: string;
}
