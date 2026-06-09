export type ConfidenceDecision = 'auto_execute' | 'request_confirmation' | 'human_review';

export interface ConfidenceScore {
  id: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  score: number;
  decision: ConfidenceDecision;
  factors: Record<string, unknown>;
  reviewRequestId?: string;
  createdAt: Date;
}

export interface ConfidenceThreshold {
  id: string;
  organizationId: string;
  autoExecuteMin: number;
  confirmationMin: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewRequest {
  id: string;
  organizationId: string;
  confidenceScoreId: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}
