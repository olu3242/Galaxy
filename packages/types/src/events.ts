/**
 * Galaxy Event Envelope
 *
 * Every state change in the system emits a GalaxyEvent.
 * Events are the authoritative record of what happened and why.
 *
 * Naming convention: <domain>.<entity>.<action>
 * Examples: workflow.submitted, loop.verified, agent.action.completed
 */

export type ActorType = 'member' | 'agent' | 'system';

export interface GalaxyEventActor {
  type: ActorType;
  id: string;
}

export interface GalaxyEventMetadata {
  idempotencyKey: string;
  schemaVersion: string;
  source: string;
}

export interface GalaxyEvent<TPayload = unknown> {
  /** UUID — unique event identifier */
  id: string;
  /** Semver string — currently "1.0" */
  version: string;
  /** Dot-separated event type: e.g. "workflow.submitted" */
  type: string;
  /** Organization UUID — tenant identifier */
  tenantId: string;
  /** UUID — traces this logical operation across the entire system */
  correlationId: string;
  /** UUID — parent event that caused this event; same as id if root */
  causationId: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  actor: GalaxyEventActor;
  payload: TPayload;
  metadata: GalaxyEventMetadata;
}

// ---------------------------------------------------------------------------
// Event type constants — source of truth for all event type strings
// ---------------------------------------------------------------------------

export const EventTypes = {
  // Communication
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  BROADCAST_DISPATCHED: 'broadcast.dispatched',

  // Workflow
  WORKFLOW_SUBMITTED: 'workflow.submitted',
  WORKFLOW_APPROVED: 'workflow.approved',
  WORKFLOW_REJECTED: 'workflow.rejected',
  WORKFLOW_ESCALATED: 'workflow.escalated',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',

  // Loop
  LOOP_STARTED: 'loop.started',
  LOOP_VERIFICATION_PENDING: 'loop.verification.pending',
  LOOP_VERIFIED: 'loop.verified',
  LOOP_FEEDBACK_RECEIVED: 'loop.feedback.received',
  LOOP_LEARNED: 'loop.learned',
  LOOP_OPTIMIZED: 'loop.optimized',
  LOOP_COMPLETED: 'loop.completed',
  LOOP_FAILED: 'loop.failed',

  // Agent
  AGENT_ACTION_STARTED: 'agent.action.started',
  AGENT_ACTION_COMPLETED: 'agent.action.completed',
  AGENT_ACTION_FAILED: 'agent.action.failed',
  AGENT_ESCALATED: 'agent.escalated',

  // People
  MEMBER_REGISTERED: 'member.registered',
  MEMBER_INVITED: 'member.invited',
  MEMBER_SUSPENDED: 'member.suspended',
  ATTENDANCE_CHECKED_IN: 'attendance.checked_in',
  INCIDENT_REPORTED: 'incident.reported',

  // Agent full lifecycle
  AGENT_CREATED: 'agent.created',
  AGENT_STARTED: 'agent.started',
  AGENT_REASONING_STARTED: 'agent.reasoning.started',
  AGENT_TOOL_SELECTED: 'agent.tool.selected',
  AGENT_TOOL_COMPLETED: 'agent.tool.completed',
  AGENT_MEMORY_UPDATED: 'agent.memory.updated',
  AGENT_POLICY_CHECKED: 'agent.policy.checked',
  AGENT_CHECKPOINT_SAVED: 'agent.checkpoint.saved',
  AGENT_RETRY: 'agent.retry',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
  AGENT_CANCELLED: 'agent.cancelled',

  // Scheduler
  SCHEDULER_JOB_STARTED: 'scheduler.job.started',
  SCHEDULER_JOB_COMPLETED: 'scheduler.job.completed',
  SCHEDULER_JOB_FAILED: 'scheduler.job.failed',

  // Webhook
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_PROCESSED: 'webhook.processed',
  WEBHOOK_FAILED: 'webhook.failed',

  // Loop OS telemetry
  LOOP_LEARNING_SESSION_STARTED: 'loop.learning.session.started',
  LOOP_OPTIMIZATION_PASS_STARTED: 'loop.optimization.pass.started',
  LOOP_KNOWLEDGE_IMPROVED: 'loop.knowledge.improved',
  LOOP_POLICY_EVOLVED: 'loop.policy.evolved',
  LOOP_RECOMMENDATION_ACCEPTED: 'loop.recommendation.accepted',
  LOOP_RECOMMENDATION_REJECTED: 'loop.recommendation.rejected',

  // Knowledge OS
  KNOWLEDGE_EMBEDDED: 'knowledge.embedded',
  KNOWLEDGE_RETRIEVED: 'knowledge.retrieved',
  KNOWLEDGE_INGESTION_FAILED: 'knowledge.ingestion.failed',
  KNOWLEDGE_DRIFT_DETECTED: 'knowledge.drift.detected',

  // Workflow telemetry
  WORKFLOW_STEP_COMPLETED: 'workflow.step.completed',
  WORKFLOW_RETRIED: 'workflow.retried',
  WORKFLOW_CHECKPOINT: 'workflow.checkpoint',
  WORKFLOW_SLA_BREACHED: 'workflow.sla.breached',

  // Runtime
  RUNTIME_EXECUTION_STARTED: 'runtime.execution.started',
  RUNTIME_EXECUTION_COMPLETED: 'runtime.execution.completed',
  RUNTIME_EXECUTION_FAILED: 'runtime.execution.failed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
