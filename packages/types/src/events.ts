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
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
