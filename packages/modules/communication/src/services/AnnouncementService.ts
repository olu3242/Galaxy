import type { Pool } from 'pg';
import { z } from 'zod';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';
import type { AuditService } from '@galaxy/identity';
import type { AnnouncementRow } from '../types.js';

export interface Announcement {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  status: string;
  publishedBy: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnouncementInput {
  organizationId: string;
  title: string;
  body: string;
  expiresAt?: string;
  createdBy: string;
  correlationId: string;
}

const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(100000),
  expiresAt: z.string().datetime().optional(),
});

function rowToAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    body: row.body,
    status: row.status,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    metadata: row.metadata,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AnnouncementService {
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

  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const parsed = CreateAnnouncementSchema.parse({
      title: input.title,
      body: input.body,
      expiresAt: input.expiresAt,
    });

    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<AnnouncementRow>(
      `INSERT INTO announcements (organization_id, title, body, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.organizationId, parsed.title, parsed.body, parsed.expiresAt ?? null, input.createdBy],
    );

    return rowToAnnouncement(result.rows[0]!);
  }

  async publish(
    organizationId: string,
    announcementId: string,
    publishedBy: string,
    correlationId: string,
  ): Promise<Announcement> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<AnnouncementRow>(
      `UPDATE announcements
       SET status = 'published', published_by = $1, published_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [publishedBy, announcementId, organizationId],
    );

    const announcement = rowToAnnouncement(result.rows[0]!);

    await this.eventPublisher.publish(
      createEvent(
        'announcement.published',
        organizationId,
        correlationId,
        { type: 'member', id: publishedBy },
        { announcementId, title: announcement.title },
      ),
    );

    await this.auditService.record({
      organizationId,
      actorType: 'member',
      actorId: publishedBy,
      action: 'announcement.published',
      resourceType: 'announcement',
      resourceId: announcementId,
      correlationId,
    });

    return announcement;
  }

  async archive(
    organizationId: string,
    announcementId: string,
    actorId: string,
    correlationId: string,
  ): Promise<Announcement> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<AnnouncementRow>(
      `UPDATE announcements SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [announcementId, organizationId],
    );

    const announcement = rowToAnnouncement(result.rows[0]!);

    await this.auditService.record({
      organizationId,
      actorType: 'member',
      actorId,
      action: 'announcement.archived',
      resourceType: 'announcement',
      resourceId: announcementId,
      correlationId,
    });

    return announcement;
  }

  async getById(organizationId: string, announcementId: string): Promise<Announcement | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AnnouncementRow>(
      'SELECT * FROM announcements WHERE id = $1 AND organization_id = $2',
      [announcementId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToAnnouncement(row) : null;
  }

  async list(organizationId: string, limit = 50, offset = 0): Promise<Announcement[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<AnnouncementRow>(
      `SELECT * FROM announcements WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return result.rows.map(rowToAnnouncement);
  }
}
