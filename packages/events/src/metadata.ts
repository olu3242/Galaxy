import { randomUUID } from 'crypto';
import type { GalaxyEventActor } from '@galaxy/types';

export interface EventMetadataInput {
  type: string;
  tenantId: string;
  correlationId: string;
  actor: GalaxyEventActor;
  causationId?: string;
  source?: string;
}

export interface EventMetadata {
  id: string;
  version: string;
  type: string;
  tenantId: string;
  correlationId: string;
  causationId: string;
  timestamp: string;
  actor: GalaxyEventActor;
  metadata: {
    idempotencyKey: string;
    schemaVersion: string;
    source: string;
  };
}

/**
 * Creates event metadata with all required fields populated.
 */
export function createEventMetadata(input: EventMetadataInput): EventMetadata {
  return {
    id: randomUUID(),
    version: '1.0',
    type: input.type,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    causationId: input.causationId ?? input.correlationId,
    timestamp: new Date().toISOString(),
    actor: input.actor,
    metadata: {
      idempotencyKey: randomUUID(),
      schemaVersion: '1.0',
      source: input.source ?? 'galaxy-api',
    },
  };
}

/**
 * Generates a new correlation ID for root operations.
 */
export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Generates a new event ID.
 */
export function newEventId(): string {
  return randomUUID();
}
