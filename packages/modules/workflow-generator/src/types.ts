export type WorkflowGenerationStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface WorkflowStep {
  order: number;
  name: string;
  description: string;
  actionType: string;
  assigneeRole?: string;
  estimatedDurationMinutes?: number;
  conditions: Record<string, unknown>;
}

export interface WorkflowGenerationRequest {
  id: string;
  organizationId: string;
  naturalLanguageDescription: string;
  industryHint?: string;
  status: WorkflowGenerationStatus;
  generatedWorkflow?: Record<string, unknown>;
  steps?: WorkflowStep[];
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}
