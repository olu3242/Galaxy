import { z } from 'zod';
import type { GalaxyEvent } from '@galaxy/types';

const ActorSchema = z.object({
  type: z.enum(['member', 'agent', 'system']),
  id: z.string().min(1),
});

const MetadataSchema = z.object({
  idempotencyKey: z.string().uuid(),
  schemaVersion: z.string(),
  source: z.string(),
});

export const GalaxyEventSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  type: z
    .string()
    .min(1)
    .regex(/^[\w.]+$/, 'Event type must be dot-separated alphanumeric'),
  tenantId: z.string().uuid(),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid(),
  timestamp: z.string().datetime(),
  actor: ActorSchema,
  payload: z.unknown(),
  metadata: MetadataSchema,
});

export type ValidatedEvent = z.infer<typeof GalaxyEventSchema>;

export interface ValidationResult {
  success: boolean;
  error?: string;
}

/**
 * Validates a GalaxyEvent against the schema.
 */
export function validateEvent(event: unknown): ValidationResult {
  const result = GalaxyEventSchema.safeParse(event);

  if (!result.success) {
    return {
      success: false,
      error: result.error.message,
    };
  }

  return { success: true };
}

/**
 * Validates and returns the typed event or throws.
 */
export function assertValidEvent<TPayload>(event: unknown): GalaxyEvent<TPayload> {
  const result = GalaxyEventSchema.safeParse(event);

  if (!result.success) {
    throw new Error(`Invalid GalaxyEvent: ${result.error.message}`);
  }

  return result.data as GalaxyEvent<TPayload>;
}
