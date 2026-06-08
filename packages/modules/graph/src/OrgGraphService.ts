import type { Pool } from 'pg';
import type {
  GraphNode,
  GraphEdge,
  TraverseDirection,
  BottleneckNode,
  CentralityRankEntry,
} from './types.js';

interface DbGraphNode {
  id: string;
  organization_id: string;
  node_type: string;
  external_id: string;
  properties: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface DbGraphEdge {
  id: string;
  organization_id: string;
  edge_type: string;
  source_node_id: string;
  target_node_id: string;
  weight: string;
  properties: Record<string, unknown>;
  created_at: Date;
}

function mapNode(row: DbGraphNode): GraphNode {
  return {
    id: row.id,
    organizationId: row.organization_id,
    nodeType: row.node_type,
    externalId: row.external_id,
    properties: row.properties,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapEdge(row: DbGraphEdge): GraphEdge {
  return {
    id: row.id,
    organizationId: row.organization_id,
    edgeType: row.edge_type,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    weight: parseFloat(row.weight),
    properties: row.properties,
    createdAt: row.created_at.toISOString(),
  };
}

async function setTenantContext(pool: Pool, orgId: string): Promise<void> {
  await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
}

export class OrgGraphService {
  constructor(private readonly pool: Pool) {}

  async upsertNode(
    orgId: string,
    nodeType: string,
    externalId: string,
    props: Record<string, unknown>,
  ): Promise<GraphNode> {
    await setTenantContext(this.pool, orgId);
    const result = await this.pool.query<DbGraphNode>(
      `INSERT INTO org_graph_nodes (organization_id, node_type, external_id, properties)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, node_type, external_id)
       DO UPDATE SET properties = EXCLUDED.properties, updated_at = NOW()
       RETURNING *`,
      [orgId, nodeType, externalId, JSON.stringify(props)],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('upsertNode: no row returned');
    }
    return mapNode(row);
  }

  async addEdge(
    orgId: string,
    edgeType: string,
    sourceNodeId: string,
    targetNodeId: string,
    weight = 1.0,
    props: Record<string, unknown> = {},
  ): Promise<GraphEdge> {
    await setTenantContext(this.pool, orgId);
    const result = await this.pool.query<DbGraphEdge>(
      `INSERT INTO org_graph_edges (organization_id, edge_type, source_node_id, target_node_id, weight, properties)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, edgeType, sourceNodeId, targetNodeId, weight, JSON.stringify(props)],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('addEdge: no row returned');
    }
    return mapEdge(row);
  }

  async removeEdge(orgId: string, edgeId: string): Promise<void> {
    await setTenantContext(this.pool, orgId);
    await this.pool.query(
      'DELETE FROM org_graph_edges WHERE id = $1 AND organization_id = $2',
      [edgeId, orgId],
    );
  }

  async getNode(
    orgId: string,
    nodeType: string,
    externalId: string,
  ): Promise<GraphNode | null> {
    await setTenantContext(this.pool, orgId);
    const result = await this.pool.query<DbGraphNode>(
      'SELECT * FROM org_graph_nodes WHERE organization_id = $1 AND node_type = $2 AND external_id = $3',
      [orgId, nodeType, externalId],
    );
    const row = result.rows[0];
    return row !== undefined ? mapNode(row) : null;
  }

  async getNodeById(orgId: string, nodeId: string): Promise<GraphNode | null> {
    await setTenantContext(this.pool, orgId);
    const result = await this.pool.query<DbGraphNode>(
      'SELECT * FROM org_graph_nodes WHERE id = $1 AND organization_id = $2',
      [nodeId, orgId],
    );
    const row = result.rows[0];
    return row !== undefined ? mapNode(row) : null;
  }

  async listNodes(orgId: string, nodeType?: string): Promise<GraphNode[]> {
    await setTenantContext(this.pool, orgId);
    if (nodeType !== undefined) {
      const result = await this.pool.query<DbGraphNode>(
        'SELECT * FROM org_graph_nodes WHERE organization_id = $1 AND node_type = $2 ORDER BY created_at DESC',
        [orgId, nodeType],
      );
      return result.rows.map(mapNode);
    }
    const result = await this.pool.query<DbGraphNode>(
      'SELECT * FROM org_graph_nodes WHERE organization_id = $1 ORDER BY created_at DESC',
      [orgId],
    );
    return result.rows.map(mapNode);
  }

  async traverse(
    orgId: string,
    startNodeId: string,
    edgeTypes: string[],
    depth: number,
    direction: TraverseDirection = 'outbound',
  ): Promise<GraphNode[]> {
    await setTenantContext(this.pool, orgId);

    const visited = new Set<string>([startNodeId]);
    const queue: Array<{ nodeId: string; d: number }> = [{ nodeId: startNodeId, d: 0 }];
    const result: GraphNode[] = [];

    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined || item.d >= depth) continue;

      let edgeRows: Array<{ neighbor_id: string }> = [];

      if (direction === 'outbound' || direction === 'both') {
        const res = await this.pool.query<{ neighbor_id: string }>(
          `SELECT target_node_id AS neighbor_id
           FROM org_graph_edges
           WHERE organization_id = $1
             AND source_node_id = $2
             AND edge_type = ANY($3::text[])`,
          [orgId, item.nodeId, edgeTypes],
        );
        edgeRows = [...edgeRows, ...res.rows];
      }

      if (direction === 'inbound' || direction === 'both') {
        const res = await this.pool.query<{ neighbor_id: string }>(
          `SELECT source_node_id AS neighbor_id
           FROM org_graph_edges
           WHERE organization_id = $1
             AND target_node_id = $2
             AND edge_type = ANY($3::text[])`,
          [orgId, item.nodeId, edgeTypes],
        );
        edgeRows = [...edgeRows, ...res.rows];
      }

      for (const edge of edgeRows) {
        if (!visited.has(edge.neighbor_id)) {
          visited.add(edge.neighbor_id);
          const node = await this.getNodeById(orgId, edge.neighbor_id);
          if (node !== null) {
            result.push(node);
            queue.push({ nodeId: edge.neighbor_id, d: item.d + 1 });
          }
        }
      }
    }

    return result;
  }

  async shortestPath(orgId: string, fromNodeId: string, toNodeId: string): Promise<GraphNode[]> {
    await setTenantContext(this.pool, orgId);

    if (fromNodeId === toNodeId) {
      const node = await this.getNodeById(orgId, fromNodeId);
      return node !== null ? [node] : [];
    }

    // Dijkstra with priority queue (array sort)
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const pq: Array<{ nodeId: string; cost: number }> = [];

    dist.set(fromNodeId, 0);
    pq.push({ nodeId: fromNodeId, cost: 0 });

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const current = pq.shift();
      if (current === undefined) break;

      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      if (current.nodeId === toNodeId) break;

      const edgesRes = await this.pool.query<{
        target_node_id: string;
        weight: string;
      }>(
        `SELECT target_node_id, weight
         FROM org_graph_edges
         WHERE organization_id = $1 AND source_node_id = $2`,
        [orgId, current.nodeId],
      );

      for (const edge of edgesRes.rows) {
        const w = parseFloat(edge.weight);
        const newCost = (dist.get(current.nodeId) ?? Infinity) + w;
        if (newCost < (dist.get(edge.target_node_id) ?? Infinity)) {
          dist.set(edge.target_node_id, newCost);
          prev.set(edge.target_node_id, current.nodeId);
          pq.push({ nodeId: edge.target_node_id, cost: newCost });
        }
      }
    }

    // Reconstruct path
    if (!dist.has(toNodeId)) return [];

    const path: string[] = [];
    let cur: string | undefined = toNodeId;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = prev.get(cur);
    }

    const nodes: GraphNode[] = [];
    for (const id of path) {
      const node = await this.getNodeById(orgId, id);
      if (node !== null) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  async neighbors(orgId: string, nodeId: string, edgeType?: string): Promise<GraphNode[]> {
    await setTenantContext(this.pool, orgId);

    let neighborIds: string[];
    if (edgeType !== undefined) {
      const res = await this.pool.query<{ neighbor_id: string }>(
        `SELECT target_node_id AS neighbor_id
         FROM org_graph_edges
         WHERE organization_id = $1 AND source_node_id = $2 AND edge_type = $3
         UNION
         SELECT source_node_id AS neighbor_id
         FROM org_graph_edges
         WHERE organization_id = $1 AND target_node_id = $2 AND edge_type = $3`,
        [orgId, nodeId, edgeType],
      );
      neighborIds = res.rows.map((r) => r.neighbor_id);
    } else {
      const res = await this.pool.query<{ neighbor_id: string }>(
        `SELECT target_node_id AS neighbor_id
         FROM org_graph_edges
         WHERE organization_id = $1 AND source_node_id = $2
         UNION
         SELECT source_node_id AS neighbor_id
         FROM org_graph_edges
         WHERE organization_id = $1 AND target_node_id = $2`,
        [orgId, nodeId],
      );
      neighborIds = res.rows.map((r) => r.neighbor_id);
    }

    const nodes: GraphNode[] = [];
    for (const id of neighborIds) {
      const node = await this.getNodeById(orgId, id);
      if (node !== null) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  async influenceScore(orgId: string, memberId: string): Promise<number> {
    await setTenantContext(this.pool, orgId);

    // Find the node for this member
    const nodeRes = await this.pool.query<{ id: string }>(
      `SELECT id FROM org_graph_nodes
       WHERE organization_id = $1 AND node_type = 'Member' AND external_id = $2`,
      [orgId, memberId],
    );
    const nodeRow = nodeRes.rows[0];
    if (nodeRow === undefined) return 0;

    const res = await this.pool.query<{ score: string }>(
      `SELECT COALESCE(SUM(weight), 0) AS score
       FROM org_graph_edges
       WHERE organization_id = $1 AND target_node_id = $2`,
      [orgId, nodeRow.id],
    );
    const row = res.rows[0];
    return row !== undefined ? parseFloat(row.score) : 0;
  }

  async findBottlenecks(orgId: string): Promise<BottleneckNode[]> {
    await setTenantContext(this.pool, orgId);

    const res = await this.pool.query<{
      node_id: string;
      in_degree: string;
      node_type: string;
    }>(
      `SELECT n.id AS node_id, COUNT(e.id) AS in_degree, n.node_type
       FROM org_graph_nodes n
       JOIN org_graph_edges e ON e.target_node_id = n.id
       WHERE n.organization_id = $1
       GROUP BY n.id, n.node_type
       HAVING COUNT(e.id) > 2
       ORDER BY COUNT(e.id) DESC`,
      [orgId],
    );

    return res.rows.map((r) => ({
      nodeId: r.node_id,
      inDegree: parseInt(r.in_degree, 10),
      nodeType: r.node_type,
    }));
  }

  async centralityRanking(
    orgId: string,
    nodeType: string,
    topN: number,
  ): Promise<CentralityRankEntry[]> {
    await setTenantContext(this.pool, orgId);

    const res = await this.pool.query<{ node_id: string; score: string }>(
      `SELECT n.id AS node_id,
              COALESCE(SUM(e.weight), 0) AS score
       FROM org_graph_nodes n
       LEFT JOIN org_graph_edges e ON e.target_node_id = n.id AND e.organization_id = $1
       WHERE n.organization_id = $1 AND n.node_type = $2
       GROUP BY n.id
       ORDER BY score DESC
       LIMIT $3`,
      [orgId, nodeType, topN],
    );

    return res.rows.map((r) => ({
      nodeId: r.node_id,
      score: parseFloat(r.score),
    }));
  }
}
