import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

export interface Role {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  scope: 'platform' | 'organization' | 'department' | 'team';
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoleRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  scope: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    scope: row.scope as Role['scope'],
    description: row.description,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateRoleInput {
  organizationId: string;
  name: string;
  slug: string;
  scope?: Role['scope'];
  description?: string;
  isSystem?: boolean;
  correlationId: string;
  actorId: string;
}

export interface AssignRoleInput {
  organizationId: string;
  membershipId: string;
  roleId: string;
  correlationId: string;
  actorId: string;
}

/**
 * RoleService — manages roles within an organization.
 */
export class RoleService {
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

  async createRole(input: CreateRoleInput): Promise<Role> {
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<RoleRow>(
      `INSERT INTO roles (organization_id, name, slug, scope, description, is_system)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.slug,
        input.scope ?? 'organization',
        input.description ?? null,
        input.isSystem ?? false,
      ],
    );

    const role = rowToRole(result.rows[0]!);

    if (this.publisher) {
      const event = createEvent(
        'role.created',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.actorId },
        { roleId: role.id, slug: role.slug },
      );
      await this.publisher.publish(event);
    }

    return role;
  }

  async getRolesForOrg(organizationId: string): Promise<Role[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<RoleRow>(
      'SELECT * FROM roles WHERE organization_id = $1 ORDER BY name ASC',
      [organizationId],
    );

    return result.rows.map(rowToRole);
  }

  async getRoleById(organizationId: string, roleId: string): Promise<Role | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<RoleRow>(
      'SELECT * FROM roles WHERE organization_id = $1 AND id = $2',
      [organizationId, roleId],
    );

    const row = result.rows[0];
    return row ? rowToRole(row) : null;
  }

  async provisionDefaultRoles(organizationId: string, correlationId: string): Promise<Role[]> {
    const defaultRoles: Array<{
      name: string;
      slug: string;
      scope: Role['scope'];
      description: string;
    }> = [
      {
        name: 'Owner',
        slug: 'org:owner',
        scope: 'organization',
        description: 'Full administrative control within the organization',
      },
      {
        name: 'Executive',
        slug: 'org:executive',
        scope: 'organization',
        description: 'Read access to all operational data and analytics',
      },
      {
        name: 'Department Head',
        slug: 'dept:head',
        scope: 'department',
        description: 'Full CRUD access within department',
      },
      {
        name: 'Manager',
        slug: 'dept:manager',
        scope: 'department',
        description: 'Manages operations within a department',
      },
      {
        name: 'Team Lead',
        slug: 'team:lead',
        scope: 'team',
        description: 'Leads a specific team within a department',
      },
      {
        name: 'Member',
        slug: 'org:member',
        scope: 'organization',
        description: 'Standard organization member',
      },
    ];

    const roles: Role[] = [];

    for (const roleData of defaultRoles) {
      const role = await this.createRole({
        organizationId,
        name: roleData.name,
        slug: roleData.slug,
        scope: roleData.scope,
        description: roleData.description,
        isSystem: true,
        correlationId,
        actorId: 'system',
      });
      roles.push(role);
    }

    return roles;
  }
}
