import type { Pool } from 'pg';
import type { TwinSnapshot } from '../types.js';

interface SnapshotRow {
  id: string;
  organization_id: string;
  node_count: number;
  relationship_count: number;
  health_score: number;
  insights: Record<string, unknown>;
  created_at: Date;
}

interface CountRow {
  count: string;
}

interface AvgRow {
  avg: string | null;
}

function rowToSnapshot(row: SnapshotRow): TwinSnapshot {
  return {
    id: row.id,
    organizationId: row.organization_id,
    nodeCount: row.node_count,
    relationshipCount: row.relationship_count,
    healthScore: row.health_score,
    insights: row.insights,
    createdAt: row.created_at,
  };
}

export class TwinSnapshotService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async takeSnapshot(orgId: string): Promise<TwinSnapshot> {
    await this.setTenantContext(orgId);

    const nodeCountResult = await this.pool.query<CountRow>(
      'SELECT COUNT(*)::text AS count FROM twin_nodes WHERE organization_id = $1',
      [orgId],
    );
    const relCountResult = await this.pool.query<CountRow>(
      'SELECT COUNT(*)::text AS count FROM twin_relationships WHERE organization_id = $1',
      [orgId],
    );
    const avgHealthResult = await this.pool.query<AvgRow>(
      'SELECT AVG(health_score)::text AS avg FROM twin_nodes WHERE organization_id = $1',
      [orgId],
    );

    const nodeCountRow = nodeCountResult.rows[0];
    const relCountRow = relCountResult.rows[0];
    const avgRow = avgHealthResult.rows[0];

    const nodeCount = nodeCountRow ? parseInt(nodeCountRow.count, 10) : 0;
    const relationshipCount = relCountRow ? parseInt(relCountRow.count, 10) : 0;
    const healthScore = avgRow?.avg !== null && avgRow?.avg !== undefined ? parseFloat(avgRow.avg) : 1.0;

    const insights: Record<string, unknown> = {
      nodeCount,
      relationshipCount,
      avgHealthScore: healthScore,
      capturedAt: new Date().toISOString(),
    };

    const result = await this.pool.query<SnapshotRow>(
      `INSERT INTO twin_snapshots
         (organization_id, node_count, relationship_count, health_score, insights)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, nodeCount, relationshipCount, healthScore, JSON.stringify(insights)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create twin snapshot');
    return rowToSnapshot(row);
  }

  async getSnapshots(orgId: string, limit?: number): Promise<TwinSnapshot[]> {
    await this.setTenantContext(orgId);
    const effectiveLimit = limit ?? 20;
    const result = await this.pool.query<SnapshotRow>(
      'SELECT * FROM twin_snapshots WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2',
      [orgId, effectiveLimit],
    );
    return result.rows.map(rowToSnapshot);
  }
}
