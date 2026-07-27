import type { z } from 'zod';

type AnyZodSchema = z.ZodTypeAny;

/**
 * EventRegistry maps event type strings to their payload zod schemas.
 * Enables runtime validation of event payloads.
 */
export class EventRegistry {
  private readonly schemas = new Map<string, AnyZodSchema>();

  /**
   * Registers a payload schema for an event type.
   */
  register(eventType: string, schema: AnyZodSchema): void {
    if (this.schemas.has(eventType)) {
      throw new Error(`Event type "${eventType}" is already registered`);
    }
    this.schemas.set(eventType, schema);
  }

  /**
   * Returns the schema for an event type, or undefined if not registered.
   */
  getSchema(eventType: string): AnyZodSchema | undefined {
    return this.schemas.get(eventType);
  }

  /**
   * Returns true if the event type has a registered schema.
   */
  has(eventType: string): boolean {
    return this.schemas.has(eventType);
  }

  /**
   * Validates a payload against the registered schema for the event type.
   * Returns { success: true } or { success: false, error: string }.
   */
  validatePayload(eventType: string, payload: unknown): { success: boolean; error?: string } {
    const schema = this.schemas.get(eventType);

    if (!schema) {
      return { success: false, error: `No schema registered for event type "${eventType}"` };
    }

    const result = schema.safeParse(payload);

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  }

  /**
   * Lists all registered event types.
   */
  listTypes(): string[] {
    return [...this.schemas.keys()];
  }
}

/** Singleton default registry */
export const defaultRegistry = new EventRegistry();
