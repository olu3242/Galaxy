import type { Pool } from 'pg';
import type { TwinNode, TwinNodeType } from '../types.js';

interface NodeRow {
  id: string;
  organization_id: string;
  node_type: string;
  external_id: string;
  name: string;
  properties: Record<string, unknown>;
  health_score: number;
  created_at: Date;
  updated_at: Date;
}

function rowToNode(row: NodeRow): TwinNode {
  return {
    id: row.id,
    organizationId: row.organization_id,
    nodeType: row.node_type as TwinNodeType,
    externalId: row.external_id,
    name: row.name,
    properties: row.properties,
    healthScore: row.health_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TwinNodeService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async upsertNode(
    orgId: string,
    nodeType: TwinNodeType,
    externalId: string,
    name: string,
    properties: Record<string, unknown>,
  ): Promise<TwinNode> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<NodeRow>(
      `INSERT INTO twin_nodes
         (organization_id, node_type, external_id, name, properties)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, node_type, external_id)
       DO UPDATE SET name = EXCLUDED.name, properties = EXCLUDED.properties, updated_at = NOW()
       RETURNING *`,
      [orgId, nodeType, externalId, name, JSON.stringify(properties)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to upsert twin node');
    return rowToNode(row);
  }

  async getNode(orgId: string, nodeId: string): Promise<TwinNode> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<NodeRow>(
      'SELECT * FROM twin_nodes WHERE organization_id = $1 AND id = $2',
      [orgId, nodeId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Twin node not found');
    return rowToNode(row);
  }

  async listNodes(orgId: string, nodeType?: TwinNodeType, limit?: number): Promise<TwinNode[]> {
    await this.setTenantContext(orgId);
    const effectiveLimit = limit ?? 100;
    let result;
    if (nodeType !== undefined) {
      result = await this.pool.query<NodeRow>(
        'SELECT * FROM twin_nodes WHERE organization_id = $1 AND node_type = $2 ORDER BY created_at DESC LIMIT $3',
        [orgId, nodeType, effectiveLimit],
      );
    } else {
      result = await this.pool.query<NodeRow>(
        'SELECT * FROM twin_nodes WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2',
        [orgId, effectiveLimit],
      );
    }
    return result.rows.map(rowToNode);
  }

  async updateHealthScore(orgId: string, nodeId: string, score: number): Promise<TwinNode> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<NodeRow>(
      `UPDATE twin_nodes SET health_score = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, nodeId, score],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Twin node not found');
    return rowToNode(row);
  }
}
