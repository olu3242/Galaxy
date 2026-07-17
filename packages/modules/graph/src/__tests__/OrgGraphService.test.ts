import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrgGraphService } from '../OrgGraphService.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const now = new Date('2024-01-01');

const baseNodeRow = {
  id: 'node-1',
  organization_id: 'org-1',
  node_type: 'Member',
  external_id: 'ext-1',
  properties: { name: 'Alice' },
  created_at: now,
  updated_at: now,
};

const baseEdgeRow = {
  id: 'edge-1',
  organization_id: 'org-1',
  edge_type: 'BELONGS_TO',
  source_node_id: 'node-1',
  target_node_id: 'node-2',
  weight: '1',
  properties: {},
  created_at: now,
};

describe('OrgGraphService', () => {
  describe('upsertNode', () => {
    it('inserts or updates node and returns mapped result', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new OrgGraphService(pool);
      const node = await svc.upsertNode('org-1', 'Member', 'ext-1', { name: 'Alice' });
      expect(node.id).toBe('node-1');
      expect(node.nodeType).toBe('Member');
      expect(node.externalId).toBe('ext-1');
      expect(node.createdAt).toBe(now.toISOString());
    });

    it('throws when no row returned', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrgGraphService(pool);
      await expect(svc.upsertNode('org-1', 'Member', 'ext-1', {})).rejects.toThrow(
        'upsertNode: no row returned',
      );
    });
  });

  describe('addEdge', () => {
    it('inserts edge and returns mapped result', async () => {
      const pool = makePool([ok([]), ok([baseEdgeRow])]);
      const svc = new OrgGraphService(pool);
      const edge = await svc.addEdge('org-1', 'BELONGS_TO', 'node-1', 'node-2');
      expect(edge.id).toBe('edge-1');
      expect(edge.edgeType).toBe('BELONGS_TO');
      expect(edge.weight).toBe(1);
    });

    it('throws when no row returned', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrgGraphService(pool);
      await expect(svc.addEdge('org-1', 'BELONGS_TO', 'node-1', 'node-2')).rejects.toThrow(
        'addEdge: no row returned',
      );
    });
  });

  describe('getNode', () => {
    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrgGraphService(pool);
      const node = await svc.getNode('org-1', 'Member', 'ext-1');
      expect(node).toBeNull();
    });

    it('returns node when found', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new OrgGraphService(pool);
      const node = await svc.getNode('org-1', 'Member', 'ext-1');
      expect(node?.id).toBe('node-1');
    });
  });

  describe('listNodes', () => {
    it('returns all nodes for org when no type filter', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new OrgGraphService(pool);
      const nodes = await svc.listNodes('org-1');
      expect(nodes).toHaveLength(1);
    });

    it('filters by nodeType when provided', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new OrgGraphService(pool);
      const nodes = await svc.listNodes('org-1', 'Member');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.nodeType).toBe('Member');
    });
  });

  describe('removeEdge', () => {
    it('resolves without throwing', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrgGraphService(pool);
      await expect(svc.removeEdge('org-1', 'edge-1')).resolves.toBeUndefined();
    });
  });

  describe('influenceScore', () => {
    it('returns 0 when member node not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new OrgGraphService(pool);
      const score = await svc.influenceScore('org-1', 'member-1');
      expect(score).toBe(0);
    });

    it('returns summed edge weight when node found', async () => {
      const pool = makePool([ok([]), ok([{ id: 'node-1' }]), ok([{ score: '7.5' }])]);
      const svc = new OrgGraphService(pool);
      const score = await svc.influenceScore('org-1', 'member-1');
      expect(score).toBe(7.5);
    });
  });

  describe('findBottlenecks', () => {
    it('returns bottleneck nodes', async () => {
      const pool = makePool([
        ok([]),
        ok([{ node_id: 'node-1', in_degree: '5', node_type: 'Member' }]),
      ]);
      const svc = new OrgGraphService(pool);
      const bottlenecks = await svc.findBottlenecks('org-1');
      expect(bottlenecks).toHaveLength(1);
      expect(bottlenecks[0]?.inDegree).toBe(5);
      expect(bottlenecks[0]?.nodeType).toBe('Member');
    });
  });

  describe('centralityRanking', () => {
    it('returns ranked entries', async () => {
      const pool = makePool([
        ok([]),
        ok([
          { node_id: 'node-1', score: '10.0' },
          { node_id: 'node-2', score: '5.0' },
        ]),
      ]);
      const svc = new OrgGraphService(pool);
      const ranking = await svc.centralityRanking('org-1', 'Member', 2);
      expect(ranking).toHaveLength(2);
      expect(ranking[0]?.score).toBe(10.0);
      expect(ranking[1]?.score).toBe(5.0);
    });
  });

  describe('traverse', () => {
    it('returns empty array when start node has no neighbors', async () => {
      // setTenantContext + outbound edge query (empty) + inbound edge query (empty)
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new OrgGraphService(pool);
      const nodes = await svc.traverse('org-1', 'node-1', ['BELONGS_TO'], 1, 'both');
      expect(nodes).toHaveLength(0);
    });

    it('returns neighbors at depth 1', async () => {
      // setTenantContext
      // outbound query returns node-2
      // inbound query returns nothing
      // getNodeById for node-2 (setTenantContext + SELECT)
      const pool = makePool([
        ok([]),
        ok([{ neighbor_id: 'node-2' }]),
        ok([]),
        ok([]),
        ok([baseNodeRow]),
      ]);
      const svc = new OrgGraphService(pool);
      const nodes = await svc.traverse('org-1', 'node-1', ['BELONGS_TO'], 1, 'both');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.id).toBe('node-1');
    });
  });
});
