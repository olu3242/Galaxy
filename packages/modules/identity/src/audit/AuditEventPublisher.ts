import type { AuditLogEntry } from '@galaxy/types';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

/**
 * AuditEventPublisher — publishes audit.recorded GalaxyEvent after each write.
 */
export class AuditEventPublisher {
  constructor(private readonly publisher: EventPublisher) {}

  async publishAuditRecorded(entry: AuditLogEntry, correlationId: string): Promise<void> {
    const event = createEvent(
      'audit.recorded',
      entry.organizationId,
      correlationId,
      { type: 'system', id: 'audit-service' },
      {
        auditLogId: entry.id,
        action: entry.action,
        actorType: entry.actorType,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
      },
    );

    await this.publisher.publish(event);
  }
}
