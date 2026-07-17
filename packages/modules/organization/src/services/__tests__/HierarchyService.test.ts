import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { HierarchyService } from '../HierarchyService.js';

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

const ORG = 'org-1';
const NODE_ID = 'node-1';

const baseRow = {
  id: NODE_ID,
  organization_id: ORG,
  parent_id: null,
  level: 'division',
  name: 'North Division',
  code: 'ND',
  metadata: {},
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('HierarchyService', () => {
  describe('createNode', () => {
    it('sets tenant context as first query then inserts node', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new HierarchyService(pool);

      const node = await svc.createNode({
        organizationId: ORG,
        level: 'division',
        name: 'North Division',
        code: 'ND',
      });

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect((calls[0]?.[1] as string[] | undefined)?.[1]).toBe(ORG);
      expect(node.id).toBe(NODE_ID);
      expect(node.name).toBe('North Division');
      expect(node.level).toBe('division');
    });

    it('throws if insert returns no rows', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HierarchyService(pool);

      await expect(
        svc.createNode({ organizationId: ORG, level: 'team', name: 'Team A' }),
      ).rejects.toThrow('Failed to create hierarchy node');
    });

    it('maps optional fields: parentId and code only set when non-null', async () => {
      const rowWithParent = { ...baseRow, parent_id: 'parent-1', code: null };
      const pool = makePool([ok([]), ok([rowWithParent])]);
      const svc = new HierarchyService(pool);

      const node = await svc.createNode({
        organizationId: ORG,
        parentId: 'parent-1',
        level: 'division',
        name: 'North Division',
      });

      expect(node.parentId).toBe('parent-1');
      expect(node.code).toBeUndefined();
    });
  });

  describe('getNode', () => {
    it('returns mapped node when found', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new HierarchyService(pool);

      const node = await svc.getNode(ORG, NODE_ID);

      expect(node).not.toBeNull();
      expect(node?.id).toBe(NODE_ID);
      expect(node?.organizationId).toBe(ORG);
    });

    it('returns null when node not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HierarchyService(pool);

      const node = await svc.getNode(ORG, 'missing-id');
      expect(node).toBeNull();
    });
  });

  describe('getChildren', () => {
    it('returns array of child nodes', async () => {
      const child1 = { ...baseRow, id: 'child-1', parent_id: NODE_ID };
      const child2 = { ...baseRow, id: 'child-2', parent_id: NODE_ID };
      const pool = makePool([ok([]), ok([child1, child2])]);
      const svc = new HierarchyService(pool);

      const children = await svc.getChildren(ORG, NODE_ID);

      expect(children).toHaveLength(2);
      expect(children[0]?.id).toBe('child-1');
      expect(children[1]?.id).toBe('child-2');
    });

    it('returns empty array when no children', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HierarchyService(pool);

      const children = await svc.getChildren(ORG, NODE_ID);
      expect(children).toEqual([]);
    });
  });

  describe('getPath', () => {
    it('returns HierarchyPath with correct depth', async () => {
      const ancestor = { ...baseRow, id: 'root-1', parent_id: null, depth: 1 };
      const target = { ...baseRow, id: NODE_ID, parent_id: 'root-1', depth: 0 };
      const pool = makePool([ok([]), ok([ancestor, target])]);
      const svc = new HierarchyService(pool);

      const path = await svc.getPath(ORG, NODE_ID);

      expect(path.nodeId).toBe(NODE_ID);
      expect(path.path).toHaveLength(2);
      expect(path.depth).toBe(2);
    });
  });

  describe('listByLevel', () => {
    it('returns nodes filtered by level', async () => {
      const n1 = { ...baseRow, id: 'n-1' };
      const n2 = { ...baseRow, id: 'n-2' };
      const pool = makePool([ok([]), ok([n1, n2])]);
      const svc = new HierarchyService(pool);

      const nodes = await svc.listByLevel(ORG, 'division');

      expect(nodes).toHaveLength(2);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      // second query should pass 'division' as level parameter
      expect((calls[1]?.[1] as string[] | undefined)?.[1]).toBe('division');
    });

    it('returns empty array when no nodes at level', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new HierarchyService(pool);

      const nodes = await svc.listByLevel(ORG, 'team');
      expect(nodes).toEqual([]);
    });
  });
});
