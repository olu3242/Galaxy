import type { Pool } from 'pg';
import { z } from 'zod';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';
import type { NotificationRow } from '../types.js';

export interface Notification {
  id: string;
  organizationId: string;
  recipientId: string;
  templateId: string | null;
  channel: string;
  title: string;
  body: string;
  status: string;
  readAt: string | null;
  data: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationInput {
  organizationId: string;
  recipientId: string;
  templateId?: string;
  channel: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actorId: string;
  correlationId: string;
}

const CreateNotificationSchema = z.object({
  channel: z.enum(['in_app', 'email', 'whatsapp', 'sms']),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
});

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    organizationId: row.organization_id,
    recipientId: row.recipient_id,
    templateId: row.template_id,
    channel: row.channel,
    title: row.title,
    body: row.body,
    status: row.status,
    readAt: row.read_at,
    data: row.data,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotificationService {
  constructor(
    private readonly pool: Pool,
    private readonly eventPublisher: EventPublisher,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const parsed = CreateNotificationSchema.parse({
      channel: input.channel,
      title: input.title,
      body: input.body,
    });

    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<NotificationRow>(
      `INSERT INTO notifications
         (organization_id, recipient_id, template_id, channel, title, body, data, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.organizationId,
        input.recipientId,
        input.templateId ?? null,
        parsed.channel,
        parsed.title,
        parsed.body,
        JSON.stringify(input.data ?? {}),
        input.correlationId,
      ],
    );

    const notification = rowToNotification(result.rows[0]!);

    await this.eventPublisher.publish(
      createEvent(
        'notification.sent',
        input.organizationId,
        input.correlationId,
        { type: 'system', id: input.actorId },
        {
          notificationId: notification.id,
          recipientId: notification.recipientId,
          channel: notification.channel,
        },
      ),
    );

    return notification;
  }

  async getById(organizationId: string, notificationId: string): Promise<Notification | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationRow>(
      'SELECT * FROM notifications WHERE id = $1 AND organization_id = $2',
      [notificationId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToNotification(row) : null;
  }

  async listForMember(
    organizationId: string,
    memberId: string,
    limit = 50,
    offset = 0,
  ): Promise<Notification[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationRow>(
      `SELECT * FROM notifications
       WHERE organization_id = $1 AND recipient_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [organizationId, memberId, limit, offset],
    );
    return result.rows.map(rowToNotification);
  }

  async markAsRead(
    organizationId: string,
    notificationId: string,
    memberId: string,
  ): Promise<Notification> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationRow>(
      `UPDATE notifications
       SET status = 'read', read_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND recipient_id = $3
       RETURNING *`,
      [notificationId, organizationId, memberId],
    );
    if (!result.rows[0]) {
      throw new Error(`Notification ${notificationId} not found`);
    }
    return rowToNotification(result.rows[0]);
  }
}
