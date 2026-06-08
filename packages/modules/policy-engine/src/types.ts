export type PolicyStatus = 'draft' | 'active' | 'inactive' | 'archived';
export type PolicyEnforcementMode = 'enforce' | 'audit' | 'disabled';
export type PolicyRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in';

export interface Policy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: PolicyStatus;
  enforcementMode: PolicyEnforcementMode;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyRule {
  id: string;
  organizationId: string;
  policyId: string;
  field: string;
  operator: PolicyRuleOperator;
  value: unknown;
  action: string;
  priority: number;
  createdAt: Date;
}

export interface PolicyEnforcementLog {
  id: string;
  organizationId: string;
  policyId: string;
  ruleId?: string;
  resourceType: string;
  resourceId: string;
  action: string;
  outcome: 'allowed' | 'denied' | 'audited';
  context: Record<string, unknown>;
  createdAt: Date;
}
