import type { GalaxyEvent } from '@galaxy/types';

export type EventHandler<TPayload = unknown> = (event: GalaxyEvent<TPayload>) => Promise<void>;

/**
 * EventSubscriber interface — implemented by BullMQ-based subscribers.
 */
export interface EventSubscriber {
  /**
   * Subscribe to an event type with a handler.
   */
  subscribe<TPayload>(eventType: string, handler: EventHandler<TPayload>): void;

  /**
   * Unsubscribe from an event type.
   */
  unsubscribe(eventType: string): void;

  /**
   * Start processing events.
   */
  start(): Promise<void>;

  /**
   * Stop processing events gracefully.
   */
  stop(): Promise<void>;
}

/**
 * In-memory EventSubscriber implementation for testing and development.
 * Production use should use BullMQ-based implementation.
 */
export class InMemoryEventSubscriber implements EventSubscriber {
  private readonly handlers = new Map<string, EventHandler<unknown>>();
  private running = false;

  subscribe<TPayload>(eventType: string, handler: EventHandler<TPayload>): void {
    this.handlers.set(eventType, handler as EventHandler<unknown>);
  }

  unsubscribe(eventType: string): void {
    this.handlers.delete(eventType);
  }

  start(): Promise<void> {
    this.running = true;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.running = false;
    return Promise.resolve();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Dispatch an event to registered handlers (for testing).
   */
  async dispatch<TPayload>(event: GalaxyEvent<TPayload>): Promise<void> {
    const handler = this.handlers.get(event.type);
    if (handler) {
      await handler(event);
    }
  }
}
