/**
 * Event Envelope — re-exports GalaxyEvent with additional trace fields.
 */
export type { GalaxyEvent, GalaxyEventActor, GalaxyEventMetadata, ActorType } from '@galaxy/types';
export { EventTypes } from '@galaxy/types';
export type { EventType } from '@galaxy/types';

/**
 * Extended event with optional trace fields for distributed tracing.
 */
export interface EventEnvelope<TPayload = unknown> {
  id: string;
  version: string;
  type: string;
  tenantId: string;
  correlationId: string;
  causationId: string;
  timestamp: string;
  actor: {
    type: 'member' | 'agent' | 'system';
    id: string;
  };
  payload: TPayload;
  metadata: {
    idempotencyKey: string;
    schemaVersion: string;
    source: string;
    traceId?: string;
    spanId?: string;
  };
}
