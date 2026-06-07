import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

export interface Team {
  id: string;
  organizationId: string;
  departmentId: string;
  name: string;
  leadMemberId: string | null;
  status: 'active' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  organizationId: string;
  teamId: string;
  membershipId: string;
  joinedAt: string;
  createdAt: string;
}

interface TeamRow {
  id: string;
  organization_id: string;
  department_id: string;
  name: string;
  lead_member_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow {
  id: string;
  organization_id: string;
  team_id: string;
  membership_id: string;
  joined_at: string;
  created_at: string;
}

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    organizationId: row.organization_id,
    departmentId: row.department_id,
    name: row.name,
    leadMemberId: row.lead_member_id,
    status: row.status as Team['status'],
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTeamMember(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    teamId: row.team_id,
    membershipId: row.membership_id,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
  };
}

export interface CreateTeamInput {
  organizationId: string;
  departmentId: string;
  name: string;
  leadMemberId?: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
  actorId: string;
}

/**
 * TeamService — manages teams within departments.
 */
export class TeamService {
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

  async create(input: CreateTeamInput): Promise<Team> {
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<TeamRow>(
      `INSERT INTO teams (organization_id, department_id, name, lead_member_id, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        input.departmentId,
        input.name,
        input.leadMemberId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const team = rowToTeam(result.rows[0]!);

    if (this.publisher) {
      const event = createEvent(
        'team.created',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.actorId },
        { teamId: team.id, name: team.name, departmentId: team.departmentId },
      );
      await this.publisher.publish(event);
    }

    return team;
  }

  async getById(organizationId: string, teamId: string): Promise<Team | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<TeamRow>(
      'SELECT * FROM teams WHERE organization_id = $1 AND id = $2',
      [organizationId, teamId],
    );

    const row = result.rows[0];
    return row ? rowToTeam(row) : null;
  }

  async list(organizationId: string, departmentId?: string): Promise<Team[]> {
    await this.setTenantContext(organizationId);

    if (departmentId) {
      const result = await this.pool.query<TeamRow>(
        "SELECT * FROM teams WHERE organization_id = $1 AND department_id = $2 AND status = 'active' ORDER BY name ASC",
        [organizationId, departmentId],
      );
      return result.rows.map(rowToTeam);
    }

    const result = await this.pool.query<TeamRow>(
      "SELECT * FROM teams WHERE organization_id = $1 AND status = 'active' ORDER BY name ASC",
      [organizationId],
    );

    return result.rows.map(rowToTeam);
  }

  async addMember(
    organizationId: string,
    teamId: string,
    membershipId: string,
  ): Promise<TeamMember> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<TeamMemberRow>(
      `INSERT INTO team_members (organization_id, team_id, membership_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, membership_id) DO NOTHING
       RETURNING *`,
      [organizationId, teamId, membershipId],
    );

    if (!result.rows[0]) {
      // Already a member — fetch and return
      const existing = await this.pool.query<TeamMemberRow>(
        'SELECT * FROM team_members WHERE team_id = $1 AND membership_id = $2',
        [teamId, membershipId],
      );
      return rowToTeamMember(existing.rows[0]!);
    }

    return rowToTeamMember(result.rows[0]);
  }

  async removeMember(organizationId: string, teamId: string, membershipId: string): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      'DELETE FROM team_members WHERE organization_id = $1 AND team_id = $2 AND membership_id = $3',
      [organizationId, teamId, membershipId],
    );
  }

  async getTeamMembers(organizationId: string, teamId: string): Promise<TeamMember[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<TeamMemberRow>(
      'SELECT * FROM team_members WHERE organization_id = $1 AND team_id = $2 ORDER BY joined_at ASC',
      [organizationId, teamId],
    );

    return result.rows.map(rowToTeamMember);
  }

  async archive(organizationId: string, teamId: string): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      "UPDATE teams SET status = 'archived', updated_at = NOW() WHERE organization_id = $1 AND id = $2",
      [organizationId, teamId],
    );
  }
}
