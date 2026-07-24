/**
 * Galaxy Autonomous Operations Framework (AOF) — Type Contracts
 *
 * AOF sits above the WRF and implements the 10-step autonomous runtime loop:
 * Observe → Analyze → Predict → Recommend → Decide → Execute → Verify → Learn → Optimize → Govern
 */

import type { UUID, ISOTimestamp } from './domain.js';

// ---------------------------------------------------------------------------
// Autonomous Loop Stage
// ---------------------------------------------------------------------------

export type AutonomousLoopStage =
  | 'observe'
  | 'analyze'
  | 'predict'
  | 'recommend'
  | 'decide'
  | 'execute'
  | 'verify'
  | 'learn'
  | 'optimize'
  | 'govern';

// ---------------------------------------------------------------------------
// AOF Observation
// ---------------------------------------------------------------------------

export type AofOutcome = 'success' | 'failure' | 'timeout' | 'cancelled';
export type AofActorType = 'member' | 'agent' | 'system';

export interface AofObservation {
  id: UUID;
  organizationId: UUID;
  eventId: UUID;
  eventType: string;
  workflowId: UUID | null;
  stageId: UUID | null;
  actorType: AofActorType;
  durationMs: number | null;
  outcome: AofOutcome;
  metadata: Record<string, unknown>;
  observedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// AOF Decision
// ---------------------------------------------------------------------------

export type AofPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type AofExecutionStrategy = 'parallel' | 'sequential' | 'deferred';
export type AofRiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface GovernanceBlocker {
  rule: string;
  reason: string;
  escalationPath: string;
}

export interface GovernanceVerdict {
  approved: boolean;
  blockers: GovernanceBlocker[];
  evaluatedAt: ISOTimestamp;
}

export interface AofDecisionOutput {
  decision: string;
  priority: AofPriority;
  confidence: number;
  executionStrategy: AofExecutionStrategy;
  estimatedCompletionMs: number | null;
  riskLevel: AofRiskLevel;
  rationale: string;
}

export interface AofDecision extends AofDecisionOutput {
  id: UUID;
  organizationId: UUID;
  governanceVerdict: GovernanceVerdict;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// AOF Prediction
// ---------------------------------------------------------------------------

export interface AofPrediction {
  id: UUID;
  organizationId: UUID;
  predictionType: string;
  horizonMinutes: number;
  payload: Record<string, unknown>;
  confidence: number;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// AOF Optimization
// ---------------------------------------------------------------------------

export type AofOptimizationStatus =
  | 'Detected'
  | 'Proposed'
  | 'Simulated'
  | 'Certified'
  | 'Executing'
  | 'Applied'
  | 'Learning';

export interface AofOptimization {
  id: UUID;
  organizationId: UUID;
  optimizationType: string;
  status: AofOptimizationStatus;
  targetWorkflow: UUID | null;
  beforeMetrics: Record<string, unknown>;
  afterMetrics: Record<string, unknown>;
  certificationId: UUID | null;
  appliedAt: ISOTimestamp | null;
  verifiedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// AOF Learning Record
// ---------------------------------------------------------------------------

export interface AofLearningRecord {
  id: UUID;
  organizationId: UUID;
  optimizationId: UUID;
  predictedMetrics: Record<string, unknown>;
  actualMetrics: Record<string, unknown>;
  delta: Record<string, unknown>;
  recordedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// AOF Certification
// ---------------------------------------------------------------------------

export type AofCertificationStatus = 'Proposed' | 'Under Review' | 'Certified' | 'Rejected';

export interface RollbackStep {
  order: number;
  action: string;
  targetService: string;
  estimatedDurationMs: number;
}

export interface RollbackPlan {
  triggerConditions: string[];
  steps: RollbackStep[];
  estimatedTotalMs: number;
  approverRequired: boolean;
}

export interface CertificationChecklist {
  governanceApproved: boolean;
  simulationPassed: boolean;
  rollbackPlanReady: boolean;
  riskLevelAcceptable: boolean;
  confidenceAboveThreshold: boolean;
  noActiveIncidents: boolean;
  retentionPolicyCompliant: boolean;
}

export interface AofCertification {
  id: UUID;
  organizationId: UUID;
  optimizationId: UUID;
  status: AofCertificationStatus;
  checklist: CertificationChecklist;
  rollbackPlan: RollbackPlan;
  reviewerId: UUID | null;
  decidedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Enterprise Optimization API Response
// ---------------------------------------------------------------------------

export interface OptimizationRecommendation {
  id: UUID;
  type: string;
  priority: AofPriority;
  confidence: number;
  estimatedSavingsMs: number | null;
  rationale: string;
}

export interface CostSavingsReport {
  projectedMonthlySavingsUsd: number;
  automationRatePercent: number;
  redundantStepsEliminated: number;
}

export interface WorkflowImprovement {
  workflowId: UUID;
  currentP95Ms: number;
  projectedP95Ms: number;
  improvementPercent: number;
}

export interface AgentPerformanceSummary {
  totalAgents: number;
  utilizationPercent: number;
  avgTaskCompletionMs: number;
  failureRatePercent: number;
}

export interface EnterpriseOptimizationPayload {
  generatedAt: ISOTimestamp;
  organizationId: UUID;
  recommendations: OptimizationRecommendation[];
  predictions: AofPrediction[];
  optimizationScore: number;
  costSavings: CostSavingsReport;
  workflowImprovements: WorkflowImprovement[];
  agentPerformance: AgentPerformanceSummary;
}
