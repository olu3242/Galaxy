import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TwinRelationshipService } from '../TwinRelationshipService.js';

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

const baseRelRow = {
  id: 'rel-1',
  organization_id: 'org-1',
  source_node_id: 'node-a',
  target_node_id: 'node-b',
  relationship_type: 'contains',
  weight: 1.0,
  properties: {},
  created_at: new Date('2024-01-01'),
};

describe('TwinRelationshipService', () => {
  describe('createRelationship', () => {
    it('inserts and returns the relationship', async () => {
      const pool = makePool([ok([]), ok([baseRelRow])]);
      const svc = new TwinRelationshipService(pool);
      const rel = await svc.createRelationship('org-1', 'node-a', 'node-b', 'contains');
      expect(rel.id).toBe('rel-1');
      expect(rel.sourceNodeId).toBe('node-a');
      expect(rel.targetNodeId).toBe('node-b');
      expect(rel.relationshipType).toBe('contains');
      expect(rel.weight).toBe(1.0);
    });

    it('uses provided weight and properties', async () => {
      const row = { ...baseRelRow, weight: 2.5, properties: { note: 'strong' } };
      const pool = makePool([ok([]), ok([row])]);
      const svc = new TwinRelationshipService(pool);
      const rel = await svc.createRelationship('org-1', 'node-a', 'node-b', 'contains', 2.5, {
        note: 'strong',
      });
      expect(rel.weight).toBe(2.5);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinRelationshipService(pool);
      await expect(svc.createRelationship('org-1', 'node-a', 'node-b', 'contains')).rejects.toThrow(
        'Failed to create twin relationship',
      );
    });
  });

  describe('getRelationships', () => {
    it('returns relationships for a node', async () => {
      const pool = makePool([ok([]), ok([baseRelRow])]);
      const svc = new TwinRelationshipService(pool);
      const rels = await svc.getRelationships('org-1', 'node-a');
      expect(rels).toHaveLength(1);
      expect(rels[0]?.id).toBe('rel-1');
    });

    it('returns empty array when no relationships', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinRelationshipService(pool);
      const rels = await svc.getRelationships('org-1', 'node-a');
      expect(rels).toHaveLength(0);
    });
  });

  describe('deleteRelationship', () => {
    it('resolves without throwing', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinRelationshipService(pool);
      await expect(svc.deleteRelationship('org-1', 'rel-1')).resolves.toBeUndefined();
    });

    it('passes correct parameters to DELETE query', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinRelationshipService(pool);
      await svc.deleteRelationship('org-1', 'rel-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
      const deleteCall = calls[1];
      expect(deleteCall?.[0]).toContain('DELETE FROM twin_relationships');
      const params = deleteCall?.[1] ?? [];
      expect(params[0]).toBe('org-1');
      expect(params[1]).toBe('rel-1');
    });
  });
});
