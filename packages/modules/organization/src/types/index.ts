// ─── Hierarchy ────────────────────────────────────────────────────────────────

export type HierarchyLevel =
  | 'platform'
  | 'organization'
  | 'division'
  | 'region'
  | 'branch'
  | 'department'
  | 'team';

export interface HierarchyNode {
  id: string;
  organizationId: string;
  parentId?: string;
  level: HierarchyLevel;
  name: string;
  code?: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HierarchyPath {
  nodeId: string;
  path: HierarchyNode[];
  depth: number;
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export type SystemRoleType =
  | 'super_platform_admin'
  | 'platform_operations'
  | 'organization_owner'
  | 'organization_admin'
  | 'executive'
  | 'regional_manager'
  | 'branch_manager'
  | 'department_manager'
  | 'team_lead'
  | 'staff'
  | 'contractor'
  | 'guest'
  | 'auditor'
  | 'external_partner'
  | 'api_client'
  | 'ai_agent';

export interface OrgRole {
  id: string;
  organizationId: string;
  name: string;
  systemRoleType?: SystemRoleType;
  hierarchyLevel?: HierarchyLevel;
  parentRoleId?: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── ABAC Attributes ─────────────────────────────────────────────────────────

export interface AbacAttributes {
  departmentId?: string;
  teamId?: string;
  region?: string;
  jobTitle?: string;
  employmentStatus?: 'active' | 'contractor' | 'suspended' | 'terminated';
  clearanceLevel?: number;
  businessHours?: boolean;
  deviceTrusted?: boolean;
  ipAllowed?: boolean;
  subscriptionPlan?: string;
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  workflowOwner?: boolean;
  hierarchyNodeId?: string;
}

export interface AbacPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  conditions: AbacCondition[];
  effect: 'allow' | 'deny';
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AbacCondition {
  attribute: keyof AbacAttributes;
  operator:
    | 'equals'
    | 'not_equals'
    | 'in'
    | 'not_in'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'exists'
    | 'not_exists';
  value: unknown;
}

// ─── Authorization ────────────────────────────────────────────────────────────

export interface AuthorizationRequest {
  organizationId: string;
  actorId: string;
  actorType: 'member' | 'agent' | 'system';
  resource: string;
  action: string;
  resourceId?: string;
  attributes?: AbacAttributes;
  correlationId: string;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  appliedRoles: string[];
  appliedPolicies: string[];
  hierarchyPath?: string[];
  requiresApproval: boolean;
  approvalTier?: ApprovalTier;
  auditRequired: boolean;
}

// ─── Delegation ───────────────────────────────────────────────────────────────

export interface Delegation {
  id: string;
  organizationId: string;
  delegatorId: string;
  delegateeId: string;
  roleId?: string;
  permissions: string[];
  reason: 'vacation' | 'acting_manager' | 'emergency_access' | 'time_bound_approval' | 'other';
  startAt: string;
  endAt: string;
  isActive: boolean;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDelegationInput {
  organizationId: string;
  delegatorId: string;
  delegateeId: string;
  roleId?: string;
  permissions: string[];
  reason: Delegation['reason'];
  startAt: string;
  endAt: string;
  approvedBy?: string;
}

// ─── Approval Matrix ─────────────────────────────────────────────────────────

export type ApprovalTier = 1 | 2 | 3 | 4 | 5;

export interface ApprovalRule {
  id: string;
  organizationId: string;
  workflowType?: string;
  departmentId?: string;
  minAmount?: number;
  maxAmount?: number;
  minRiskScore?: number;
  maxRiskScore?: number;
  requiredRole: string;
  tier: ApprovalTier;
  requiresMultipleApprovers: boolean;
  approverCount: number;
  escalationAfterHours: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalMatrixEvaluation {
  tier: ApprovalTier;
  requiredApprovers: string[];
  rules: ApprovalRule[];
  escalationDeadline?: string;
}

// ─── Agent Permissions ────────────────────────────────────────────────────────

export interface AgentPermissionProfile {
  id: string;
  organizationId: string;
  agentType: string;
  agentName: string;
  allowedTools: string[];
  accessibleKnowledgeSources: string[];
  writableResources: string[];
  approvalLimits: Record<string, number>;
  escalationRules: AgentEscalationRule[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEscalationRule {
  condition: string;
  escalateTo: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Permission Analytics ────────────────────────────────────────────────────

export interface PermissionAnalytics {
  organizationId: string;
  period: string;
  roleDistribution: { role: string; count: number }[];
  failedAuthAttempts: number;
  privilegeEscalationAttempts: number;
  dormantAccounts: number;
  activeDelegations: number;
  highRiskUsers: string[];
  complianceViolations: number;
  abacPoliciesEvaluated: number;
  generatedAt: string;
}
