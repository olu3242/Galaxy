import type { Pool } from 'pg';
import { z } from 'zod';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';
import type { AuditService } from '@galaxy/identity';
import type { MessageRow } from '../types.js';

export interface Message {
  id: string;
  organizationId: string;
  channelId: string;
  senderId: string;
  threadId: string | null;
  content: string;
  contentType: string;
  status: string;
  isDeleted: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageInput {
  organizationId: string;
  channelId: string;
  senderId: string;
  content: string;
  contentType?: string;
  threadId?: string;
  correlationId: string;
}

const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  contentType: z.enum(['text', 'image', 'file', 'audio', 'video', 'template']).optional(),
  threadId: z.string().uuid().optional(),
});

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    organizationId: row.organization_id,
    channelId: row.channel_id,
    senderId: row.sender_id,
    threadId: row.thread_id,
    content: row.content,
    contentType: row.content_type,
    status: row.status,
    isDeleted: row.is_deleted,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MessageService {
  constructor(
    private readonly pool: Pool,
    private readonly eventPublisher: EventPublisher,
    private readonly auditService: AuditService,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async send(input: SendMessageInput): Promise<Message> {
    const parsed = SendMessageSchema.parse({
      content: input.content,
      contentType: input.contentType,
      threadId: input.threadId,
    });

    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<MessageRow>(
      `INSERT INTO messages (organization_id, channel_id, sender_id, content, content_type, thread_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.channelId,
        input.senderId,
        parsed.content,
        parsed.contentType ?? 'text',
        parsed.threadId ?? null,
      ],
    );

    const message = rowToMessage(result.rows[0]!);

    await this.eventPublisher.publish(
      createEvent(
        'message.sent',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.senderId },
        { messageId: message.id, channelId: message.channelId },
      ),
    );

    await this.auditService.record({
      organizationId: input.organizationId,
      actorType: 'member',
      actorId: input.senderId,
      action: 'message.sent',
      resourceType: 'message',
      resourceId: message.id,
      correlationId: input.correlationId,
    });

    return message;
  }

  async getById(organizationId: string, messageId: string): Promise<Message | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MessageRow>(
      'SELECT * FROM messages WHERE id = $1 AND organization_id = $2 AND is_deleted = false',
      [messageId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToMessage(row) : null;
  }

  async listForChannel(
    organizationId: string,
    channelId: string,
    limit = 50,
    offset = 0,
  ): Promise<Message[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<MessageRow>(
      `SELECT * FROM messages
       WHERE channel_id = $1 AND organization_id = $2 AND is_deleted = false
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [channelId, organizationId, limit, offset],
    );
    return result.rows.map(rowToMessage);
  }

  async softDelete(
    organizationId: string,
    messageId: string,
    actorId: string,
    correlationId: string,
  ): Promise<void> {
    await this.setTenantContext(organizationId);
    await this.pool.query(
      'UPDATE messages SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND organization_id = $2',
      [messageId, organizationId],
    );
    await this.auditService.record({
      organizationId,
      actorType: 'member',
      actorId,
      action: 'message.deleted',
      resourceType: 'message',
      resourceId: messageId,
      correlationId,
    });
  }
}
