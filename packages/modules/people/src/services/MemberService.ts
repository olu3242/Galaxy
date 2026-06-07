import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

export interface MemberProfile {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string;
  whatsappPhone: string | null;
  email: string | null;
  status: 'active' | 'suspended' | 'archived';
  roleId: string | null;
  profileData: Record<string, unknown>;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  display_name: string;
  whatsapp_phone: string | null;
  email: string | null;
  membership_status: string;
  role_id: string | null;
  profile_data: Record<string, unknown>;
  last_active_at: string | null;
  user_created_at: string;
  membership_updated_at: string;
}

function rowToMember(row: MemberRow): MemberProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    displayName: row.display_name,
    whatsappPhone: row.whatsapp_phone,
    email: row.email,
    status: row.membership_status as MemberProfile['status'],
    roleId: row.role_id,
    profileData: row.profile_data,
    lastActiveAt: row.last_active_at,
    createdAt: row.user_created_at,
    updatedAt: row.membership_updated_at,
  };
}

export interface UpdateMemberInput {
  displayName?: string;
  profileData?: Record<string, unknown>;
  correlationId: string;
  actorId: string;
}

/**
 * MemberService — manages member profiles and status within an organization.
 */
export class MemberService {
  constructor(
    private readonly pool: Pool,
    private readonly publisher?: EventPublisher,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async getById(organizationId: string, membershipId: string): Promise<MemberProfile | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<MemberRow>(
      `SELECT
        m.id, m.organization_id, m.user_id, u.display_name, u.whatsapp_phone,
        u.email, m.status AS membership_status, m.role_id, u.profile_data,
        u.last_active_at, u.created_at AS user_created_at, m.updated_at AS membership_updated_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.id = $2`,
      [organizationId, membershipId],
    );

    const row = result.rows[0];
    return row ? rowToMember(row) : null;
  }

  async list(
    organizationId: string,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<MemberProfile[]> {
    await this.setTenantContext(organizationId);

    const status = options?.status ?? 'active';
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const result = await this.pool.query<MemberRow>(
      `SELECT
        m.id, m.organization_id, m.user_id, u.display_name, u.whatsapp_phone,
        u.email, m.status AS membership_status, m.role_id, u.profile_data,
        u.last_active_at, u.created_at AS user_created_at, m.updated_at AS membership_updated_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.status = $2
       ORDER BY u.display_name ASC
       LIMIT $3 OFFSET $4`,
      [organizationId, status, limit, offset],
    );

    return result.rows.map(rowToMember);
  }

  async search(organizationId: string, query: string): Promise<MemberProfile[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<MemberRow>(
      `SELECT
        m.id, m.organization_id, m.user_id, u.display_name, u.whatsapp_phone,
        u.email, m.status AS membership_status, m.role_id, u.profile_data,
        u.last_active_at, u.created_at AS user_created_at, m.updated_at AS membership_updated_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
         AND m.status = 'active'
         AND (
           u.display_name ILIKE $2
           OR u.email ILIKE $2
         )
       ORDER BY u.display_name ASC
       LIMIT 50`,
      [organizationId, `%${query}%`],
    );

    return result.rows.map(rowToMember);
  }

  async update(
    organizationId: string,
    membershipId: string,
    input: UpdateMemberInput,
  ): Promise<MemberProfile> {
    await this.setTenantContext(organizationId);

    const existing = await this.getById(organizationId, membershipId);
    if (!existing) {
      throw new Error(`Member ${membershipId} not found`);
    }

    const newProfileData = input.profileData
      ? { ...existing.profileData, ...input.profileData }
      : existing.profileData;

    await this.pool.query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           profile_data = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [input.displayName ?? null, JSON.stringify(newProfileData), existing.userId],
    );

    const updated = await this.getById(organizationId, membershipId);

    if (!updated) {
      throw new Error(`Member ${membershipId} not found after update`);
    }

    if (this.publisher) {
      const event = createEvent(
        'member.updated',
        organizationId,
        input.correlationId,
        { type: 'member', id: input.actorId },
        { membershipId, updates: { displayName: input.displayName } },
      );
      await this.publisher.publish(event);
    }

    return updated;
  }

  async updateStatus(
    organizationId: string,
    membershipId: string,
    status: 'active' | 'suspended' | 'archived',
    correlationId: string,
    actorId: string,
  ): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      'UPDATE memberships SET status = $1, updated_at = NOW() WHERE organization_id = $2 AND id = $3',
      [status, organizationId, membershipId],
    );

    if (this.publisher) {
      const event = createEvent(
        'member.updated',
        organizationId,
        correlationId,
        { type: 'member', id: actorId },
        { membershipId, status },
      );
      await this.publisher.publish(event);
    }
  }
}
