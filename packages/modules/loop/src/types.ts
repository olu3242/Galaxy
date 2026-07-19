export type LoopStatus =
  | 'pending'
  | 'verifying'
  | 'collecting_feedback'
  | 'completed'
  | 'escalated';
export type VerificationStatus = 'pending' | 'confirmed' | 'rejected' | 'expired';

export interface LoopInstance {
  id: string;
  organizationId: string;
  workflowInstanceId: string;
  status: LoopStatus;
  verificationDeadline: string;
  feedbackDeadline: string | null;
  verificationCount: number;
  feedbackScore: number | null;
  outcomeNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoopVerification {
  id: string;
  loopInstanceId: string;
  verifiedBy: string;
  status: VerificationStatus;
  notes: string | null;
  evidenceUrls: string[];
  verifiedAt: string | null;
  createdAt: string;
}

export interface LoopFeedback {
  id: string;
  loopInstanceId: string;
  submittedBy: string;
  score: number;
  comment: string | null;
  submittedAt: string;
}

export interface CreateLoopInput {
  organizationId: string;
  workflowInstanceId: string;
  verificationDeadlineHours?: number;
}

export interface SubmitVerificationInput {
  loopInstanceId: string;
  verifiedBy: string;
  status: 'confirmed' | 'rejected';
  notes?: string;
  evidenceUrls?: string[];
}

export interface SubmitFeedbackInput {
  loopInstanceId: string;
  submittedBy: string;
  score: number;
  comment?: string;
}
