import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TwinSnapshotService } from '../TwinSnapshotService.js';

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

const baseSnapshotRow = {
  id: 'snap-1',
  organization_id: 'org-1',
  node_count: 10,
  relationship_count: 5,
  health_score: 0.85,
  insights: { nodeCount: 10 },
  created_at: new Date('2024-01-01'),
};

describe('TwinSnapshotService', () => {
  describe('takeSnapshot', () => {
    it('aggregates counts and inserts snapshot', async () => {
      // setTenantContext + nodeCount + relCount + avgHealth + INSERT
      const pool = makePool([
        ok([]),
        ok([{ count: '10' }]),
        ok([{ count: '5' }]),
        ok([{ avg: '0.85' }]),
        ok([baseSnapshotRow]),
      ]);
      const svc = new TwinSnapshotService(pool);
      const snap = await svc.takeSnapshot('org-1');
      expect(snap.id).toBe('snap-1');
      expect(snap.nodeCount).toBe(10);
      expect(snap.relationshipCount).toBe(5);
      expect(snap.healthScore).toBe(0.85);
    });

    it('uses 1.0 health score when avg is null', async () => {
      const pool = makePool([
        ok([]),
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
        ok([{ avg: null }]),
        ok([{ ...baseSnapshotRow, node_count: 0, relationship_count: 0, health_score: 1.0 }]),
      ]);
      const svc = new TwinSnapshotService(pool);
      const snap = await svc.takeSnapshot('org-1');
      expect(snap.healthScore).toBe(1.0);
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([
        ok([]),
        ok([{ count: '0' }]),
        ok([{ count: '0' }]),
        ok([{ avg: null }]),
        ok([]),
      ]);
      const svc = new TwinSnapshotService(pool);
      await expect(svc.takeSnapshot('org-1')).rejects.toThrow('Failed to create twin snapshot');
    });

    it('handles missing count rows by defaulting to 0', async () => {
      const pool = makePool([ok([]), ok([]), ok([]), ok([]), ok([baseSnapshotRow])]);
      const svc = new TwinSnapshotService(pool);
      const snap = await svc.takeSnapshot('org-1');
      expect(snap.id).toBe('snap-1');
    });
  });

  describe('getSnapshots', () => {
    it('returns snapshots for an org', async () => {
      const pool = makePool([ok([]), ok([baseSnapshotRow])]);
      const svc = new TwinSnapshotService(pool);
      const snaps = await svc.getSnapshots('org-1');
      expect(snaps).toHaveLength(1);
      expect(snaps[0]?.id).toBe('snap-1');
    });

    it('uses default limit of 20', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinSnapshotService(pool);
      await svc.getSnapshots('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
        string,
        unknown[],
      ][];
      const selectCall = calls[1];
      const params = selectCall?.[1] ?? [];
      expect(params[1]).toBe(20);
    });

    it('uses provided limit', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TwinSnapshotService(pool);
      await svc.getSnapshots('org-1', 5);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
        string,
        unknown[],
      ][];
      const selectCall = calls[1];
      const params = selectCall?.[1] ?? [];
      expect(params[1]).toBe(5);
    });
  });
});
