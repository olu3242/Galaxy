import type { Pool } from 'pg';
import { z } from 'zod';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';
import type { AuditService } from '@galaxy/identity';
import type { BroadcastRow } from '../types.js';

export interface Broadcast {
  id: string;
  organizationId: string;
  title: string;
  content: string;
  targetType: string;
  targetIds: string[];
  status: string;
  sentCount: number;
  failedCount: number;
  sentBy: string;
  sentAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBroadcastInput {
  organizationId: string;
  title: string;
  content: string;
  targetType?: string;
  targetIds?: string[];
  sentBy: string;
  correlationId: string;
}

const CreateBroadcastSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(50000),
  targetType: z.enum(['all', 'department', 'team', 'role', 'custom']).optional(),
  targetIds: z.array(z.string()).optional(),
});

function rowToBroadcast(row: BroadcastRow): Broadcast {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    content: row.content,
    targetType: row.target_type,
    targetIds: row.target_ids,
    status: row.status,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    sentBy: row.sent_by,
    sentAt: row.sent_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BroadcastService {
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

  async create(input: CreateBroadcastInput): Promise<Broadcast> {
    const parsed = CreateBroadcastSchema.parse({
      title: input.title,
      content: input.content,
      targetType: input.targetType,
      targetIds: input.targetIds,
    });

    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<BroadcastRow>(
      `INSERT INTO broadcasts (organization_id, title, content, target_type, target_ids, sent_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        parsed.title,
        parsed.content,
        parsed.targetType ?? 'all',
        JSON.stringify(parsed.targetIds ?? []),
        input.sentBy,
      ],
    );

    const broadcastRow = result.rows[0];
    if (!broadcastRow) throw new Error('INSERT RETURNING returned no row');
    return rowToBroadcast(broadcastRow);
  }

  async send(
    organizationId: string,
    broadcastId: string,
    actorId: string,
    correlationId: string,
  ): Promise<Broadcast> {
    await this.setTenantContext(organizationId);

    let broadcast: Broadcast | null = null;
    try {
      const result = await this.pool.query<BroadcastRow>(
        `UPDATE broadcasts SET status = 'sent', sent_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [broadcastId, organizationId],
      );
      const sentRow = result.rows[0];
      if (!sentRow) throw new Error('UPDATE RETURNING returned no row');
      broadcast = rowToBroadcast(sentRow);

      await this.eventPublisher.publish(
        createEvent(
          'broadcast.sent',
          organizationId,
          correlationId,
          { type: 'member', id: actorId },
          { broadcastId, title: broadcast.title, targetType: broadcast.targetType },
        ),
      );

      await this.auditService.record({
        organizationId,
        actorType: 'member',
        actorId,
        action: 'broadcast.sent',
        resourceType: 'broadcast',
        resourceId: broadcastId,
        correlationId,
      });

      return broadcast;
    } catch (err) {
      await this.pool.query<BroadcastRow>(
        `UPDATE broadcasts SET status = 'failed', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [broadcastId, organizationId],
      );

      await this.eventPublisher.publish(
        createEvent(
          'broadcast.failed',
          organizationId,
          correlationId,
          { type: 'system', id: 'system' },
          { broadcastId, error: String(err) },
        ),
      );

      throw err;
    }
  }

  async getById(organizationId: string, broadcastId: string): Promise<Broadcast | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<BroadcastRow>(
      'SELECT * FROM broadcasts WHERE id = $1 AND organization_id = $2',
      [broadcastId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToBroadcast(row) : null;
  }

  async list(organizationId: string, limit = 50, offset = 0): Promise<Broadcast[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<BroadcastRow>(
      'SELECT * FROM broadcasts WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [organizationId, limit, offset],
    );
    return result.rows.map(rowToBroadcast);
  }
}
