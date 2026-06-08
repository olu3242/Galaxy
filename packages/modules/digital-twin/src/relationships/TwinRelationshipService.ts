import type { Pool } from 'pg';
import type { TwinRelationship, TwinRelationshipType } from '../types.js';

interface RelationshipRow {
  id: string;
  organization_id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  weight: number;
  properties: Record<string, unknown>;
  created_at: Date;
}

function rowToRelationship(row: RelationshipRow): TwinRelationship {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    relationshipType: row.relationship_type as TwinRelationshipType,
    weight: row.weight,
    properties: row.properties,
    createdAt: row.created_at,
  };
}

export class TwinRelationshipService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createRelationship(
    orgId: string,
    sourceNodeId: string,
    targetNodeId: string,
    relationshipType: TwinRelationshipType,
    weight?: number,
    properties?: Record<string, unknown>,
  ): Promise<TwinRelationship> {
    await this.setTenantContext(orgId);
    const effectiveWeight = weight ?? 1.0;
    const effectiveProperties = properties ?? {};
    const result = await this.pool.query<RelationshipRow>(
      `INSERT INTO twin_relationships
         (organization_id, source_node_id, target_node_id, relationship_type, weight, properties)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        orgId,
        sourceNodeId,
        targetNodeId,
        relationshipType,
        effectiveWeight,
        JSON.stringify(effectiveProperties),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create twin relationship');
    return rowToRelationship(row);
  }

  async getRelationships(orgId: string, nodeId: string): Promise<TwinRelationship[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<RelationshipRow>(
      `SELECT * FROM twin_relationships
       WHERE organization_id = $1 AND (source_node_id = $2 OR target_node_id = $2)
       ORDER BY created_at DESC`,
      [orgId, nodeId],
    );
    return result.rows.map(rowToRelationship);
  }

  async deleteRelationship(orgId: string, relationshipId: string): Promise<void> {
    await this.setTenantContext(orgId);
    await this.pool.query('DELETE FROM twin_relationships WHERE organization_id = $1 AND id = $2', [
      orgId,
      relationshipId,
    ]);
  }
}
