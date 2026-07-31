/**
 * Galaxy Workstream Reliability Framework (WRF) — Type Contracts
 *
 * Every workstream executed in Galaxy — from a WhatsApp message to an autonomous
 * agent task — must conform to these types. The WRF replaces ad-hoc per-feature
 * runtime models with a single shared contract that supports checkpointing,
 * recovery, structured telemetry, and dependency health monitoring.
 */

import type { UUID, ISOTimestamp } from './domain.js';

// ---------------------------------------------------------------------------
// Workstream Execution State
// ---------------------------------------------------------------------------

export type WorkstreamExecutionState =
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'degraded'
  | 'paused'
  | 'cancelled';

// ---------------------------------------------------------------------------
// Workstream Channel
// ---------------------------------------------------------------------------

export type WorkstreamChannel =
  | 'whatsapp'
  | 'web'
  | 'api'
  | 'scheduler'
  | 'webhook'
  | 'integration'
  | 'internal';

// ---------------------------------------------------------------------------
// Workstream Stage
// The 17-stage lifecycle every workstream must pass through.
// ---------------------------------------------------------------------------

export type WorkstreamStage =
  | 'event_received'
  | 'identity_resolution'
  | 'organization_resolution'
  | 'workspace_resolution'
  | 'permission_validation'
  | 'intent_detection'
  | 'workflow_resolution'
  | 'ai_planning'
  | 'agent_assignment'
  | 'knowledge_retrieval'
  | 'task_execution'
  | 'state_synchronization'
  | 'notification_delivery'
  | 'audit_logging'
  | 'learning_engine'
  | 'certification'
  | 'completed';

// ---------------------------------------------------------------------------
// Workstream Dependency
// ---------------------------------------------------------------------------

export type DependencyHealth = 'healthy' | 'warning' | 'degraded' | 'unavailable';

export type DependencyName =
  | 'identity_service'
  | 'organization_service'
  | 'workflow_os'
  | 'agent_os'
  | 'knowledge_os'
  | 'memory_engine'
  | 'ai_coordinator'
  | 'postgresql'
  | 'redis'
  | 'queue'
  | 'whatsapp_runtime'
  | 'notification_engine'
  | 'loop_os'
  | 'audit_service';

export interface WorkstreamDependency {
  name: DependencyName;
  health: DependencyHealth;
  latencyMs: number | null;
  lastCheckedAt: ISOTimestamp;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Workstream Checkpoint
// ---------------------------------------------------------------------------

export interface WorkstreamCheckpoint {
  id: UUID;
  workstreamId: UUID;
  organizationId: UUID;
  stage: WorkstreamStage;
  state: Record<string, unknown>;
  retryCount: number;
  savedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Workstream Runtime — the canonical execution context
// ---------------------------------------------------------------------------

export interface WorkstreamRuntime {
  /** Unique workstream execution ID */
  workstreamId: UUID;

  /** Tenant scope */
  organizationId: UUID;

  /** Optional sub-workspace (e.g. department or team) */
  workspaceId: UUID | null;

  /** Authenticated actor driving this workstream */
  actorId: UUID | null;

  /** Channel that originated the event */
  channel: WorkstreamChannel;

  /** Classified intent (e.g. 'leave_request', 'expense_request') */
  intent: string | null;

  /** Resolved workflow definition ID */
  workflowId: UUID | null;

  /** Current execution state */
  executionState: WorkstreamExecutionState;

  /** Current lifecycle stage */
  currentStage: WorkstreamStage;

  /** Correlation ID threading this workstream to all emitted events and audit rows */
  correlationId: UUID;

  /** Trace ID linking across distributed services */
  requestId: UUID;

  /** Agent IDs assigned to this workstream */
  agentIds: UUID[];

  /** Workflow DAG node IDs in execution order */
  workflowGraph: string[];

  /** Number of retries attempted for the current stage */
  retryCount: number;

  /** Wall-clock ms from event_received to current stage */
  latencyMs: number;

  /** External dependencies declared by this workstream */
  dependencies: WorkstreamDependency[];

  /** Non-fatal warnings accumulated during execution */
  warnings: string[];

  /** Structured errors (one per failed stage attempt) */
  errors: WorkstreamError[];

  /** Composite health signal */
  health: DependencyHealth;

  /** Last persisted checkpoint */
  lastCheckpoint: WorkstreamCheckpoint | null;

  /** ISO timestamp when this workstream was initiated */
  startedAt: ISOTimestamp;

  /** ISO timestamp when execution completed or failed */
  completedAt: ISOTimestamp | null;
}

// ---------------------------------------------------------------------------
// Workstream Error — structured, actionable failure record
// ---------------------------------------------------------------------------

export interface WorkstreamError {
  stage: WorkstreamStage;
  dependency: DependencyName | null;
  errorCode: string;
  httpStatus: number | null;
  message: string;
  recoveryAction: string;
  retryable: boolean;
  occurredAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Workstream Telemetry Record — one row per stage transition
// ---------------------------------------------------------------------------

export interface WorkstreamTelemetry {
  id: UUID;
  workstreamId: UUID;
  organizationId: UUID;
  stage: WorkstreamStage;
  durationMs: number;
  success: boolean;
  errorCode: string | null;
  dependency: DependencyName | null;
  agentId: UUID | null;
  retryCount: number;
  recordedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Dependency Health Matrix — snapshot across all dependencies for an org
// ---------------------------------------------------------------------------

export interface DependencyHealthMatrix {
  organizationId: UUID;
  generatedAt: ISOTimestamp;
  overall: DependencyHealth;
  dependencies: WorkstreamDependency[];
}

// ---------------------------------------------------------------------------
// Mission Control Workstream Summary — one row in the /admin/runtime view
// ---------------------------------------------------------------------------

export interface WorkstreamSummary {
  workstreamId: UUID;
  organizationId: UUID;
  channel: WorkstreamChannel;
  intent: string | null;
  executionState: WorkstreamExecutionState;
  currentStage: WorkstreamStage;
  retryCount: number;
  latencyMs: number;
  agentCount: number;
  health: DependencyHealth;
  startedAt: ISOTimestamp;
  completedAt: ISOTimestamp | null;
}

// ---------------------------------------------------------------------------
// WRF Runtime Intelligence API Response
// ---------------------------------------------------------------------------

export interface RuntimeIntelligenceResponse {
  workstreams: {
    active: WorkstreamSummary[];
    waiting: WorkstreamSummary[];
    failed: WorkstreamSummary[];
    recentlyCompleted: WorkstreamSummary[];
  };
  agents: {
    total: number;
    busy: number;
    idle: number;
    failed: number;
  };
  dependencies: DependencyHealthMatrix;
  runtime: {
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
    throughputPerMinute: number;
  };
  queues: Record<string, { depth: number; processingRate: number; oldestJobAgeMs: number }>;
  knowledge: {
    retrievalSuccessRate: number;
    avgLatencyMs: number;
  };
  memory: {
    utilizationPercent: number;
  };
  health: DependencyHealth;
}
