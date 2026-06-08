import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  roleId: string | null;
  status: 'active' | 'suspended' | 'archived';
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string | null;
  status: string;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

function rowToMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleId: row.role_id,
    status: row.status as Membership['status'],
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface AddMemberInput {
  organizationId: string;
  userId: string;
  roleId?: string;
  correlationId: string;
  actorId: string;
}

/**
 * MembershipService — manages organization memberships.
 */
export class MembershipService {
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

  async addMember(input: AddMemberInput): Promise<Membership> {
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<MembershipRow>(
      `INSERT INTO memberships (organization_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET status = 'active', updated_at = NOW()
       RETURNING *`,
      [input.organizationId, input.userId, input.roleId ?? null],
    );

    const membershipRow = result.rows[0];
    if (!membershipRow) throw new Error('INSERT into memberships returned no row');
    const membership = rowToMembership(membershipRow);

    if (this.publisher) {
      const event = createEvent(
        'member.created',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.actorId },
        { membershipId: membership.id, userId: membership.userId },
      );
      await this.publisher.publish(event);
    }

    return membership;
  }

  async removeMember(
    organizationId: string,
    userId: string,
    correlationId: string,
    actorId: string,
  ): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      "UPDATE memberships SET status = 'archived', updated_at = NOW() WHERE organization_id = $1 AND user_id = $2",
      [organizationId, userId],
    );

    if (this.publisher) {
      const event = createEvent(
        'member.updated',
        organizationId,
        correlationId,
        { type: 'member', id: actorId },
        { userId, status: 'archived' },
      );
      await this.publisher.publish(event);
    }
  }

  async getMembership(organizationId: string, userId: string): Promise<Membership | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<MembershipRow>(
      'SELECT * FROM memberships WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId],
    );

    const row = result.rows[0];
    return row ? rowToMembership(row) : null;
  }

  async getMemberships(organizationId: string): Promise<Membership[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<MembershipRow>(
      "SELECT * FROM memberships WHERE organization_id = $1 AND status = 'active' ORDER BY joined_at ASC",
      [organizationId],
    );

    return result.rows.map(rowToMembership);
  }

  async updateRole(
    organizationId: string,
    userId: string,
    roleId: string | null,
    correlationId: string,
    actorId: string,
  ): Promise<Membership> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<MembershipRow>(
      'UPDATE memberships SET role_id = $1, updated_at = NOW() WHERE organization_id = $2 AND user_id = $3 RETURNING *',
      [roleId, organizationId, userId],
    );

    if (!result.rows[0]) {
      throw new Error(`Membership not found for user ${userId} in org ${organizationId}`);
    }

    const membership = rowToMembership(result.rows[0]);

    if (this.publisher) {
      const event = createEvent(
        'role.assigned',
        organizationId,
        correlationId,
        { type: 'member', id: actorId },
        { userId, roleId, membershipId: membership.id },
      );
      await this.publisher.publish(event);
    }

    return membership;
  }
}
