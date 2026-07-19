export type FailureCategory =
  | 'low_confidence_intent'
  | 'duplicate_request'
  | 'wrong_department_routing'
  | 'wrong_assignee_routing'
  | 'workflow_failure'
  | 'approval_failure'
  | 'escalation_failure'
  | 'agent_failure'
  | 'knowledge_failure'
  | 'communication_failure'
  | 'org_misconfiguration'
  | 'data_integrity_failure';

export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FailureStatus = 'open' | 'in_recovery' | 'recovered' | 'escalated' | 'ignored';

export interface FailureRecord {
  id: string;
  organizationId: string;
  category: FailureCategory;
  severity: FailureSeverity;
  status: FailureStatus;
  description: string;
  context: Record<string, unknown>;
  recoveryRuleId?: string;
  resolvedBy?: string;
  detectedAt: Date;
  resolvedAt?: Date;
}

export interface FailureRecoveryRule {
  id: string;
  organizationId: string;
  category: FailureCategory;
  name: string;
  autoRecover: boolean;
  recoveryAction: string;
  maxRetries: number;
  enabled: boolean;
  createdAt: Date;
}

export interface FailureClassification {
  category: FailureCategory;
  severity: FailureSeverity;
  confidence: number;
  suggestedAction: string;
}
