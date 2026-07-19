export type GovernanceActionType =
  | 'terminate_employee'
  | 'transfer_funds'
  | 'approve_legal_agreement'
  | 'override_policy'
  | 'execute_governance_exception'
  | 'modify_executive_role';

export type GovernanceApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface GovernanceApprovalRequest {
  id: string;
  organizationId: string;
  actionType: GovernanceActionType;
  requestedBy: string;
  resourceType: string;
  resourceId: string;
  context: Record<string, unknown>;
  status: GovernanceApprovalStatus;
  approvedBy?: string;
  approvalNote?: string;
  expiresAt: Date;
  createdAt: Date;
  resolvedAt?: Date;
}
