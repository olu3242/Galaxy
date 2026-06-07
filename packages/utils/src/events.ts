import { randomUUID } from 'crypto';
import type { GalaxyEvent, GalaxyEventActor } from '@galaxy/types';

/**
 * Creates a well-formed GalaxyEvent envelope.
 *
 * Usage:
 *   const event = createEvent('workflow.submitted', tenantId, correlationId, actor, payload);
 */
export function createEvent<TPayload>(
  type: string,
  tenantId: string,
  correlationId: string,
  actor: GalaxyEventActor,
  payload: TPayload,
  causationId?: string,
): GalaxyEvent<TPayload> {
  return {
    id: randomUUID(),
    version: '1.0',
    type,
    tenantId,
    correlationId,
    causationId: causationId ?? correlationId,
    timestamp: new Date().toISOString(),
    actor,
    payload,
    metadata: {
      idempotencyKey: randomUUID(),
      schemaVersion: '1.0',
      source: 'galaxy-api',
    },
  };
}

/** Generates a new correlation ID for a root operation (no parent event). */
export function newCorrelationId(): string {
  return randomUUID();
}
