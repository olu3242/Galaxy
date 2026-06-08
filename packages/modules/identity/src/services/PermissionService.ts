import type { Pool } from 'pg';

export interface Permission {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  resource: string;
  action: string;
  description: string | null;
  createdAt: string;
}

interface PermissionRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: string;
}

function rowToPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    resource: row.resource,
    action: row.action,
    description: row.description,
    createdAt: row.created_at,
  };
}

export interface CreatePermissionInput {
  organizationId: string;
  name: string;
  slug: string;
  resource: string;
  action: string;
  description?: string;
}

/**
 * PermissionService — manages permissions and role-permission assignments.
 */
export class PermissionService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createPermission(input: CreatePermissionInput): Promise<Permission> {
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<PermissionRow>(
      `INSERT INTO permissions (organization_id, name, slug, resource, action, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.slug,
        input.resource,
        input.action,
        input.description ?? null,
      ],
    );

    const permRow = result.rows[0];
    if (!permRow) throw new Error('INSERT into permissions returned no row');
    return rowToPermission(permRow);
  }

  async assignPermissionToRole(
    organizationId: string,
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [organizationId, roleId, permissionId],
    );
  }

  async getPermissionsForRole(organizationId: string, roleId: string): Promise<Permission[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<PermissionRow>(
      `SELECT p.*
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.organization_id = $1 AND rp.role_id = $2`,
      [organizationId, roleId],
    );

    return result.rows.map(rowToPermission);
  }

  async checkPermission(
    organizationId: string,
    memberId: string,
    resource: string,
    action: string,
  ): Promise<boolean> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN memberships m ON m.role_id = rp.role_id
       WHERE m.organization_id = $1
         AND m.user_id = $2
         AND p.resource = $3
         AND p.action = $4
         AND m.status = 'active'`,
      [organizationId, memberId, resource, action],
    );

    return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
  }

  async listPermissions(organizationId: string): Promise<Permission[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<PermissionRow>(
      'SELECT * FROM permissions WHERE organization_id = $1 ORDER BY resource, action',
      [organizationId],
    );

    return result.rows.map(rowToPermission);
  }
}
