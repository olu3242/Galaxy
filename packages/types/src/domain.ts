/**
 * Galaxy Core Domain Types
 *
 * Shared domain interfaces used across apps and packages.
 * These are structural types only — no business logic.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export type UUID = string;
export type ISOTimestamp = string;

// ---------------------------------------------------------------------------
// Organizations (Tenants)
// ---------------------------------------------------------------------------

export type IndustryType =
  | 'church'
  | 'ngo'
  | 'school'
  | 'cooperative'
  | 'political'
  | 'association'
  | 'creator'
  | 'public_safety'
  | 'government';

export type PlanTier = 'starter' | 'growth' | 'enterprise';

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  industryType: IndustryType;
  planTier: PlanTier;
  whatsappPhone: string | null;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberStatus = 'active' | 'suspended' | 'archived';

export interface Member {
  id: UUID;
  organizationId: UUID;
  departmentId: UUID | null;
  teamId: UUID | null;
  whatsappPhone: string;
  displayName: string;
  roleId: UUID | null;
  status: MemberStatus;
  profileData: Record<string, unknown>;
  lastActiveAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export type WorkflowInstanceStatus =
  | 'submitted'
  | 'under_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'in_progress'
  | 'completed'
  | 'archived'
  | 'failed';

export interface WorkflowInstance {
  id: UUID;
  organizationId: UUID;
  workflowId: UUID;
  submittedBy: UUID;
  status: WorkflowInstanceStatus;
  currentStep: number;
  data: Record<string, unknown>;
  slaDueAt: ISOTimestamp | null;
  completedAt: ISOTimestamp | null;
  correlationId: UUID;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Loops
// ---------------------------------------------------------------------------

export type LoopInstanceStatus =
  | 'created'
  | 'analyzing'
  | 'executing'
  | 'verifying'
  | 'collecting_feedback'
  | 'learning'
  | 'optimizing'
  | 'completed'
  | 'failed';

export type VerificationMethod =
  | 'manager_confirmation'
  | 'photo_evidence'
  | 'location_checkin'
  | 'document_upload'
  | 'digital_signature'
  | 'agent_verification';

export interface LoopInstance {
  id: UUID;
  loopId: UUID;
  organizationId: UUID;
  workflowInstanceId: UUID | null;
  status: LoopInstanceStatus;
  verificationState: 'pending' | 'in_progress' | 'verified' | 'failed';
  learningState: 'not_started' | 'in_progress' | 'completed';
  optimizationState: 'not_started' | 'in_progress' | 'applied' | 'rolled_back';
  outcomeScore: number | null;
  feedbackScore: number | null;
  startedAt: ISOTimestamp;
  completedAt: ISOTimestamp | null;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentType =
  | 'executive'
  | 'hr'
  | 'finance'
  | 'operations'
  | 'compliance'
  | 'knowledge'
  | 'communications';

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditActorType = 'member' | 'agent' | 'system';

export interface AuditLogEntry {
  id: number;
  organizationId: UUID;
  actorType: AuditActorType;
  actorId: UUID | null;
  action: string;
  resourceType: string | null;
  resourceId: UUID | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  correlationId: UUID;
  causationId: UUID | null;
  createdAt: ISOTimestamp;
}
