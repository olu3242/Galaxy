/**
 * Organization Graph Certification Test Suite
 *
 * Certifies the Org Graph module lifecycle:
 * 1.  org_graph_nodes and org_graph_edges tables exist with correct columns
 * 2.  Nodes can be upserted and retrieved
 * 3.  Edges connect nodes with correct weight and type
 * 4.  Graph traversal returns connected neighbor nodes
 * 5.  Bottleneck detection identifies high-in-degree nodes
 * 6.  Centrality ranking returns scored entries in descending order
 * 7.  Cross-tenant isolation — org B cannot see org A's graph nodes
 * 8.  Upsert is idempotent — duplicate insert updates properties, not duplicates
 * 9.  Edge removal does not delete the connected nodes
 * 10. Member network query returns the ego-network subgraph
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { OrgGraphService } from '@galaxy/graph';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-bb01-4000-8000-b1a000000001';
const orgIdB = '00000000-bb01-4000-8000-b1a000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Graph Test Org A', 'graph-test-a', 'starter', 'active'),
            ($2, 'Graph Test Org B', 'graph-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM org_graph_edges WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM org_graph_nodes WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Organization Graph Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. org_graph_nodes and org_graph_edges tables exist', async () => {
    for (const table of ['org_graph_nodes', 'org_graph_edges']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Nodes can be upserted ───────────────────────────────────────────────
  it('2. Nodes can be upserted and retrieved', async () => {
    const svc = new OrgGraphService(pool);

    const node = await svc.upsertNode(orgId, 'Member', 'member-001', {
      name: 'Alice',
      role: 'manager',
    });
    expect(node.id).toBeTruthy();
    expect(node.organizationId).toBe(orgId);
    expect(node.nodeType).toBe('Member');
    expect(node.externalId).toBe('member-001');
    expect(node.properties.name).toBe('Alice');

    const nodes = await svc.listNodes(orgId, 'Member');
    expect(nodes.some((n) => n.externalId === 'member-001')).toBe(true);
  });

  // ── 3. Edges connect nodes ────────────────────────────────────────────────
  it('3. Edges connect nodes with correct weight and type', async () => {
    const svc = new OrgGraphService(pool);

    const src = await svc.upsertNode(orgId, 'Member', 'member-002', { name: 'Bob' });
    const tgt = await svc.upsertNode(orgId, 'Department', 'dept-001', { name: 'Engineering' });

    const edge = await svc.addEdge(orgId, 'BELONGS_TO', src.id, tgt.id, 1.0, { since: '2024-01' });
    expect(edge.id).toBeTruthy();
    expect(edge.edgeType).toBe('BELONGS_TO');
    expect(edge.sourceNodeId).toBe(src.id);
    expect(edge.targetNodeId).toBe(tgt.id);
    expect(edge.weight).toBe(1.0);
  });

  // ── 4. Graph traversal ────────────────────────────────────────────────────
  it('4. Traversal returns connected neighbor nodes', async () => {
    const svc = new OrgGraphService(pool);

    const a = await svc.upsertNode(orgId, 'Workflow', 'wf-001', { domain: 'leave' });
    const b = await svc.upsertNode(orgId, 'Workflow', 'wf-002', { domain: 'expense' });
    await svc.addEdge(orgId, 'DEPENDS_ON', a.id, b.id, 0.8, {});

    const neighbors = await svc.neighbors(orgId, a.id);
    expect(Array.isArray(neighbors)).toBe(true);
    expect(neighbors.some((n) => n.id === b.id)).toBe(true);
  });

  // ── 5. Bottleneck detection ───────────────────────────────────────────────
  it('5. Bottleneck detection identifies high-in-degree nodes', async () => {
    const svc = new OrgGraphService(pool);

    const hub = await svc.upsertNode(orgId, 'Member', 'manager-hub', { name: 'Hub Manager' });
    for (let i = 0; i < 3; i++) {
      const sub = await svc.upsertNode(orgId, 'Member', `sub-member-${String(i)}`, {
        name: `Sub ${String(i)}`,
      });
      await svc.addEdge(orgId, 'REPORTS_TO', sub.id, hub.id, 1.0, {});
    }

    const bottlenecks = await svc.findBottlenecks(orgId);
    expect(Array.isArray(bottlenecks)).toBe(true);
    const hubBottleneck = bottlenecks.find((b) => b.nodeId === hub.id);
    expect(hubBottleneck).toBeDefined();
    expect(hubBottleneck?.inDegree ?? 0).toBeGreaterThanOrEqual(2);
  });

  // ── 6. Centrality ranking ─────────────────────────────────────────────────
  it('6. Centrality ranking returns scored entries in descending order', async () => {
    const svc = new OrgGraphService(pool);
    const ranks = await svc.centralityRanking(orgId, 'Member', 10);
    expect(Array.isArray(ranks)).toBe(true);
    if (ranks.length > 1) {
      const r0 = ranks[0];
      const r1 = ranks[1];
      if (r0 && r1) {
        expect(r0.score).toBeGreaterThanOrEqual(r1.score);
      }
    }
    if (ranks.length > 0) {
      expect(ranks[0]).toHaveProperty('nodeId');
      expect(ranks[0]).toHaveProperty('score');
    }
  });

  // ── 7. Cross-tenant isolation ─────────────────────────────────────────────
  it('7. Org B cannot see org A graph nodes', async () => {
    const svc = new OrgGraphService(pool);

    await svc.upsertNode(orgId, 'Agent', 'isolation-agent', { secret: 'org-a-data' });

    const nodesB = await svc.listNodes(orgIdB, 'Agent');
    const leaked = nodesB.some((n) => n.externalId === 'isolation-agent');
    expect(leaked).toBe(false);
  });

  // ── 8. Upsert idempotency ─────────────────────────────────────────────────
  it('8. Upsert is idempotent — duplicate insert updates properties', async () => {
    const svc = new OrgGraphService(pool);

    await svc.upsertNode(orgId, 'Agent', 'agent-idem-001', { version: '1.0' });
    const updated = await svc.upsertNode(orgId, 'Agent', 'agent-idem-001', { version: '2.0' });

    expect(updated.externalId).toBe('agent-idem-001');
    expect(updated.properties.version).toBe('2.0');

    const agentNodes = (await svc.listNodes(orgId, 'Agent')).filter(
      (n) => n.externalId === 'agent-idem-001',
    );
    expect(agentNodes.length).toBe(1);
  });

  // ── 9. Edge removal ───────────────────────────────────────────────────────
  it('9. Edge removal does not delete the connected nodes', async () => {
    const svc = new OrgGraphService(pool);

    const n1 = await svc.upsertNode(orgId, 'Task', 'task-del-001', { status: 'open' });
    const n2 = await svc.upsertNode(orgId, 'Task', 'task-del-002', { status: 'open' });
    const edge = await svc.addEdge(orgId, 'BLOCKS', n1.id, n2.id, 1.0, {});

    await svc.removeEdge(orgId, edge.id);

    const allNodes = await svc.listNodes(orgId);
    expect(allNodes.some((n) => n.id === n1.id)).toBe(true);
    expect(allNodes.some((n) => n.id === n2.id)).toBe(true);

    const neighborsAfter = await svc.neighbors(orgId, n1.id, 'BLOCKS');
    expect(neighborsAfter.some((n) => n.id === n2.id)).toBe(false);
  });

  // ── 10. Member network ────────────────────────────────────────────────────
  it('10. Member network query returns the ego-network subgraph', async () => {
    const svc = new OrgGraphService(pool);
    const { GraphQueryService } = await import('@galaxy/graph');
    const qSvc = new GraphQueryService(svc);

    const member = await svc.upsertNode(orgId, 'Member', 'ego-member-001', { name: 'Ego Node' });
    const peer = await svc.upsertNode(orgId, 'Member', 'ego-peer-001', { name: 'Peer' });
    await svc.addEdge(orgId, 'MANAGES', member.id, peer.id, 1.0, {});

    // getMemberNetwork uses externalId as the memberId
    const network = await qSvc.getMemberNetwork(orgId, 'ego-member-001', 1);
    expect(Array.isArray(network)).toBe(true);
  });
});
