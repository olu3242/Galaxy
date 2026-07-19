export type DeploymentStatus = 'pending' | 'analyzing' | 'provisioning' | 'complete' | 'failed';
export type DeploymentResourceType =
  | 'organization'
  | 'department'
  | 'team'
  | 'workflow'
  | 'role'
  | 'policy';

export interface DeploymentPlan {
  id: string;
  organizationId: string;
  naturalLanguageDescription: string;
  industryHint?: string;
  status: DeploymentStatus;
  parsedIntent: Record<string, unknown>;
  resources: DeploymentResource[];
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface DeploymentResource {
  id: string;
  deploymentPlanId: string;
  resourceType: DeploymentResourceType;
  name: string;
  config: Record<string, unknown>;
  status: 'pending' | 'created' | 'failed';
  createdAt: Date;
}

export interface OrgDiscoverySession {
  id: string;
  organizationId: string;
  currentStep: number;
  totalSteps: number;
  responses: Record<string, unknown>;
  generatedStructure?: Record<string, unknown>;
  status: 'in_progress' | 'complete' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}
