export type EscalationType =
  | 'manager'
  | 'department'
  | 'executive'
  | 'emergency'
  | 'timeout'
  | 'approval'
  | 'case'
  | 'incident';

export type EscalationStatus = 'pending' | 'acknowledged' | 'resolved' | 'timed_out';

export interface EscalationRecord {
  id: string;
  organizationId: string;
  escalationType: EscalationType;
  status: EscalationStatus;
  resourceType: string;
  resourceId: string;
  reason: string;
  escalatedTo: string;
  escalatedBy: string;
  dueAt?: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface DelegationRecord {
  id: string;
  organizationId: string;
  fromMemberId: string;
  toMemberId: string;
  scope: string;
  startsAt: Date;
  endsAt?: Date;
  active: boolean;
  createdAt: Date;
}
