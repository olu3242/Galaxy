import type { AuditLogEntry } from '@galaxy/types';
import type { AuditRepository, InsertAuditLogInput } from './AuditRepository.js';
import type { AuditEventPublisher } from './AuditEventPublisher.js';

/**
 * AuditService — records audit events.
 *
 * Every write operation in IdentityOS must call AuditService.record().
 */
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly eventPublisher?: AuditEventPublisher,
  ) {}

  /**
   * Records an audit log entry and publishes the audit.recorded event.
   */
  async record(input: InsertAuditLogInput): Promise<AuditLogEntry> {
    const entry = await this.repository.insert(input);

    if (this.eventPublisher) {
      await this.eventPublisher.publishAuditRecorded(entry, input.correlationId);
    }

    return entry;
  }
}
