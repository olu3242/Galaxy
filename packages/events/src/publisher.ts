import type { Pool } from 'pg';
import type { GalaxyEvent } from '@galaxy/types';
import { validateEvent } from './validator.js';
import type { EventRegistry } from './registry.js';

export type PublishResult =
  | { success: true; eventId: string; error?: never }
  | { success: false; eventId: string; error: string };

/**
 * EventPublisher validates and persists GalaxyEvents to the events table.
 *
 * Always validates the event envelope before writing.
 * Sets the tenant context before inserting.
 */
export class EventPublisher {
  constructor(
    private readonly pool: Pool,
    private readonly registry?: EventRegistry,
  ) {}

  /**
   * Publishes a single event to the event store.
   */
  async publish<TPayload>(event: GalaxyEvent<TPayload>): Promise<PublishResult> {
    // Validate envelope structure
    const envelopeResult = validateEvent(event);
    if (!envelopeResult.success) {
      return {
        success: false,
        eventId: event.id,
        error: envelopeResult.error ?? 'Invalid event envelope',
      };
    }

    // Validate payload if registry is available
    if (this.registry) {
      const payloadResult = this.registry.validatePayload(event.type, event.payload);
      if (!payloadResult.success) {
        return {
          success: false,
          eventId: event.id,
          error: payloadResult.error ?? 'Invalid event payload',
        };
      }
    }

    // Set tenant context then insert
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      event.tenantId,
    ]);

    await this.pool.query(
      `INSERT INTO events (
        id, organization_id, type, version, correlation_id, causation_id,
        actor_type, actor_id, payload, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.id,
        event.tenantId,
        event.type,
        event.version,
        event.correlationId,
        event.causationId,
        event.actor.type,
        event.actor.id,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata),
        event.timestamp,
      ],
    );

    return { success: true, eventId: event.id };
  }

  /**
   * Publishes multiple events in a single transaction.
   */
  async publishBatch<TPayload>(events: GalaxyEvent<TPayload>[]): Promise<PublishResult[]> {
    if (events.length === 0) return [];

    const results: PublishResult[] = [];
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const event of events) {
        const envelopeResult = validateEvent(event);
        if (!envelopeResult.success) {
          results.push({
            success: false,
            eventId: event.id,
            error: envelopeResult.error ?? 'Invalid event envelope',
          });
          continue;
        }

        await client.query('SELECT set_config($1, $2, true)', [
          'app.current_tenant',
          event.tenantId,
        ]);

        await client.query(
          `INSERT INTO events (
            id, organization_id, type, version, correlation_id, causation_id,
            actor_type, actor_id, payload, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            event.id,
            event.tenantId,
            event.type,
            event.version,
            event.correlationId,
            event.causationId,
            event.actor.type,
            event.actor.id,
            JSON.stringify(event.payload),
            JSON.stringify(event.metadata),
            event.timestamp,
          ],
        );

        results.push({ success: true, eventId: event.id });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return results;
  }
}
