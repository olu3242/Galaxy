import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TwinNodeService } from '../TwinNodeService.js';

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

const baseNodeRow = {
  id: 'node-1',
  organization_id: 'org-1',
  node_type: 'member',
  external_id: 'ext-1',
  name: 'Alice',
  properties: { role: 'engineer' },
  health_score: 0.9,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

describe('TwinNodeService', () => {
  describe('upsertNode', () => {
    it('inserts or updates a node and returns it', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new TwinNodeService(pool);
      const node = await svc.upsertNode('org-1', 'member', 'ext-1', 'Alice', { role: 'engineer' });
      expect(node.id).toBe('node-1');
      expect(node.nodeType).toBe('member');
      expect(node.healthScore).toBe(0.9);
    });

    it('throws when no row returned', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinNodeService(pool);
      await expect(svc.upsertNode('org-1', 'member', 'ext-1', 'Alice', {})).rejects.toThrow(
        'Failed to upsert twin node',
      );
    });
  });

  describe('getNode', () => {
    it('returns the node when found', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new TwinNodeService(pool);
      const node = await svc.getNode('org-1', 'node-1');
      expect(node.id).toBe('node-1');
      expect(node.externalId).toBe('ext-1');
    });

    it('throws when node not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinNodeService(pool);
      await expect(svc.getNode('org-1', 'missing')).rejects.toThrow('Twin node not found');
    });
  });

  describe('listNodes', () => {
    it('returns all nodes when no type filter', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new TwinNodeService(pool);
      const nodes = await svc.listNodes('org-1');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.name).toBe('Alice');
    });

    it('returns nodes filtered by type', async () => {
      const pool = makePool([ok([]), ok([baseNodeRow])]);
      const svc = new TwinNodeService(pool);
      const nodes = await svc.listNodes('org-1', 'member');
      expect(nodes).toHaveLength(1);
    });

    it('returns empty array when no nodes', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinNodeService(pool);
      const nodes = await svc.listNodes('org-1');
      expect(nodes).toHaveLength(0);
    });
  });

  describe('updateHealthScore', () => {
    it('updates health score and returns node', async () => {
      const updatedRow = { ...baseNodeRow, health_score: 0.5 };
      const pool = makePool([ok([]), ok([updatedRow])]);
      const svc = new TwinNodeService(pool);
      const node = await svc.updateHealthScore('org-1', 'node-1', 0.5);
      expect(node.healthScore).toBe(0.5);
    });

    it('throws when node not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinNodeService(pool);
      await expect(svc.updateHealthScore('org-1', 'missing', 0.5)).rejects.toThrow(
        'Twin node not found',
      );
    });
  });
});
