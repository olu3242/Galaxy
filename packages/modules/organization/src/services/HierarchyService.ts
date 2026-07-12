import type { Pool } from 'pg';
import type { HierarchyLevel, HierarchyNode, HierarchyPath } from '../types/index.js';

export interface CreateNodeInput {
  organizationId: string;
  parentId?: string;
  level: HierarchyLevel;
  name: string;
  code?: string;
  metadata?: Record<string, unknown>;
}

/**
 * HierarchyService manages the configurable organizational hierarchy tree.
 *
 * Supports: platform → organization → division → region → branch → department → team
 *
 * Organizations can customize which levels they use. All queries are tenant-isolated
 * via RLS (app.current_tenant must be set before calling).
 */
export class HierarchyService {
  constructor(private readonly pool: Pool) {}

  async createNode(input: CreateNodeInput): Promise<HierarchyNode> {
    await this.setTenant(input.organizationId);

    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      parent_id: string | null;
      level: string;
      name: string;
      code: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO org_hierarchy_nodes
         (organization_id, parent_id, level, name, code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.parentId ?? null,
        input.level,
        input.name,
        input.code ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create hierarchy node');
    return this.mapRow(row);
  }

  async getNode(organizationId: string, nodeId: string): Promise<HierarchyNode | null> {
    await this.setTenant(organizationId);
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      parent_id: string | null;
      level: string;
      name: string;
      code: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM org_hierarchy_nodes
       WHERE id = $1 AND organization_id = $2 AND is_active = true`,
      [nodeId, organizationId],
    );
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async getChildren(organizationId: string, parentId: string): Promise<HierarchyNode[]> {
    await this.setTenant(organizationId);
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      parent_id: string | null;
      level: string;
      name: string;
      code: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM org_hierarchy_nodes
       WHERE parent_id = $1 AND organization_id = $2 AND is_active = true
       ORDER BY name`,
      [parentId, organizationId],
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async getPath(organizationId: string, nodeId: string): Promise<HierarchyPath> {
    await this.setTenant(organizationId);
    // Recursive CTE to walk up the hierarchy
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      parent_id: string | null;
      level: string;
      name: string;
      code: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      depth: number;
    }>(
      `WITH RECURSIVE ancestors AS (
         SELECT *, 0 AS depth FROM org_hierarchy_nodes WHERE id = $1 AND organization_id = $2
         UNION ALL
         SELECT n.*, a.depth + 1
         FROM org_hierarchy_nodes n
         JOIN ancestors a ON n.id = a.parent_id
         WHERE n.organization_id = $2
       )
       SELECT * FROM ancestors ORDER BY depth DESC`,
      [nodeId, organizationId],
    );

    const path = result.rows.map((r) => this.mapRow(r));
    return { nodeId, path, depth: result.rows.length };
  }

  async listByLevel(organizationId: string, level: HierarchyLevel): Promise<HierarchyNode[]> {
    await this.setTenant(organizationId);
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      parent_id: string | null;
      level: string;
      name: string;
      code: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM org_hierarchy_nodes
       WHERE organization_id = $1 AND level = $2 AND is_active = true
       ORDER BY name`,
      [organizationId, level],
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  private mapRow(row: {
    id: string;
    organization_id: string;
    parent_id: string | null;
    level: string;
    name: string;
    code: string | null;
    metadata: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }): HierarchyNode {
    const node: HierarchyNode = {
      id: row.id,
      organizationId: row.organization_id,
      level: row.level as HierarchyLevel,
      name: row.name,
      metadata: row.metadata,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.parent_id !== null) node.parentId = row.parent_id;
    if (row.code !== null) node.code = row.code;
    return node;
  }
}
