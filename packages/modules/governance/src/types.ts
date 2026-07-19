export type PolicyType = 'data_retention' | 'access_control' | 'workflow_approval';
export type PolicyStatus = 'active' | 'inactive' | 'draft';
export type ComplianceStatus = 'pass' | 'fail' | 'warning';
export type RetentionAction = 'flag' | 'archive' | 'delete';

export interface Policy {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  policyType: PolicyType;
  status: PolicyStatus;
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRule {
  id: string;
  policyId: string;
  organizationId: string;
  name: string;
  condition: Record<string, unknown>;
  action: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

export interface ComplianceCheck {
  id: string;
  organizationId: string;
  checkType: string;
  status: ComplianceStatus;
  details: Record<string, unknown>;
  violations: string[];
  runAt: string;
  runBy: string;
}

export interface ComplianceReport {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  summary: Record<string, unknown>;
  generatedBy: string;
  generatedAt: string;
}

export interface DataRetentionPolicy {
  id: string;
  organizationId: string;
  resourceType: string;
  retentionDays: number;
  action: RetentionAction;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditExport {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  entries: AuditExportEntry[];
  exportedAt: string;
  exportedBy: string;
}

export interface AuditExportEntry {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreatePolicyInput {
  organizationId: string;
  name: string;
  policyType: PolicyType;
  createdBy: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface CreatePolicyRuleInput {
  policyId: string;
  organizationId: string;
  name: string;
  condition: Record<string, unknown>;
  action: string;
  priority?: number;
}

export interface CreateDataRetentionPolicyInput {
  organizationId: string;
  resourceType: string;
  retentionDays: number;
  action: RetentionAction;
  createdBy: string;
}
