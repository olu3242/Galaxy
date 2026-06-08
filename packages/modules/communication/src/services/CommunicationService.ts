import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';
import { ChannelService } from './ChannelService.js';
import { MessageService } from './MessageService.js';
import { BroadcastService } from './BroadcastService.js';
import { AnnouncementService } from './AnnouncementService.js';

/**
 * CommunicationService — orchestrates cross-service operations for the Communication OS.
 */
export class CommunicationService {
  public readonly channels: ChannelService;
  public readonly messages: MessageService;
  public readonly broadcasts: BroadcastService;
  public readonly announcements: AnnouncementService;

  constructor(pool: Pool, eventPublisher: EventPublisher, auditService: AuditService) {
    this.channels = new ChannelService(pool, eventPublisher, auditService);
    this.messages = new MessageService(pool, eventPublisher, auditService);
    this.broadcasts = new BroadcastService(pool, eventPublisher, auditService);
    this.announcements = new AnnouncementService(pool, eventPublisher, auditService);
  }
}
