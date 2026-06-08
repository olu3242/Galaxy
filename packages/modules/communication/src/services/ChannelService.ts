import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';
import type { AuditService } from '@galaxy/identity';
import type { ChannelRow } from '../types.js';

export interface Channel {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  channelType: string;
  isArchived: boolean;
  createdBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelInput {
  organizationId: string;
  name: string;
  description?: string;
  channelType?: string;
  createdBy: string;
  correlationId: string;
}

export interface AddChannelMemberInput {
  organizationId: string;
  channelId: string;
  memberId: string;
  role?: string;
  actorId: string;
  correlationId: string;
}

const CreateChannelSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  channelType: z.enum(['direct', 'group', 'broadcast', 'announcement']).optional(),
});

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    channelType: row.channel_type,
    isArchived: row.is_archived,
    createdBy: row.created_by,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ChannelService {
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

  async create(input: CreateChannelInput): Promise<Channel> {
    const parsed = CreateChannelSchema.parse({
      name: input.name,
      description: input.description,
      channelType: input.channelType,
    });

    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<ChannelRow>(
      `INSERT INTO channels (organization_id, name, description, channel_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        parsed.name,
        parsed.description ?? null,
        parsed.channelType ?? 'group',
        input.createdBy,
      ],
    );

    const channelRow = result.rows[0];
    if (!channelRow) throw new Error('INSERT RETURNING returned no row');
    const channel = rowToChannel(channelRow);

    await this.eventPublisher.publish(
      createEvent(
        'channel.created',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.createdBy },
        { channelId: channel.id, name: channel.name, channelType: channel.channelType },
      ),
    );

    await this.auditService.record({
      organizationId: input.organizationId,
      actorType: 'member',
      actorId: input.createdBy,
      action: 'channel.created',
      resourceType: 'channel',
      resourceId: channel.id,
      newValue: { name: channel.name, channelType: channel.channelType },
      correlationId: input.correlationId,
    });

    return channel;
  }

  async getById(organizationId: string, channelId: string): Promise<Channel | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<ChannelRow>(
      'SELECT * FROM channels WHERE id = $1 AND organization_id = $2',
      [channelId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToChannel(row) : null;
  }

  async list(organizationId: string, limit = 50, offset = 0): Promise<Channel[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<ChannelRow>(
      'SELECT * FROM channels WHERE organization_id = $1 AND is_archived = false ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [organizationId, limit, offset],
    );
    return result.rows.map(rowToChannel);
  }

  async delete(
    organizationId: string,
    channelId: string,
    actorId: string,
    correlationId: string,
  ): Promise<void> {
    await this.setTenantContext(organizationId);
    await this.pool.query(
      'UPDATE channels SET is_archived = true, updated_at = NOW() WHERE id = $1 AND organization_id = $2',
      [channelId, organizationId],
    );
    await this.auditService.record({
      organizationId,
      actorType: 'member',
      actorId,
      action: 'channel.deleted',
      resourceType: 'channel',
      resourceId: channelId,
      correlationId,
    });
  }

  async addMember(input: AddChannelMemberInput): Promise<void> {
    await this.setTenantContext(input.organizationId);
    await this.pool.query(
      `INSERT INTO channel_members (id, organization_id, channel_id, member_id, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel_id, member_id) DO NOTHING`,
      [randomUUID(), input.organizationId, input.channelId, input.memberId, input.role ?? 'member'],
    );

    await this.eventPublisher.publish(
      createEvent(
        'channel.member.added',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.actorId },
        { channelId: input.channelId, memberId: input.memberId },
      ),
    );
  }

  async removeMember(organizationId: string, channelId: string, memberId: string): Promise<void> {
    await this.setTenantContext(organizationId);
    await this.pool.query(
      'DELETE FROM channel_members WHERE channel_id = $1 AND member_id = $2 AND organization_id = $3',
      [channelId, memberId, organizationId],
    );
  }

  async listMembers(
    organizationId: string,
    channelId: string,
  ): Promise<{ memberId: string; role: string; joinedAt: string }[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<{
      member_id: string;
      role: string;
      joined_at: string;
    }>(
      'SELECT member_id, role, joined_at FROM channel_members WHERE channel_id = $1 AND organization_id = $2 ORDER BY joined_at ASC',
      [channelId, organizationId],
    );
    return result.rows.map((r) => ({
      memberId: r.member_id,
      role: r.role,
      joinedAt: r.joined_at,
    }));
  }
}
