import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PlatformHealthService } from '../PlatformHealthService.js';

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

const snapshotRow = {
  id: 'snap-1',
  status: 'healthy',
  components: { database: { status: 'up' } },
  snapshot_at: '2024-01-01T00:00:00Z',
};

describe('PlatformHealthService', () => {
  describe('recordSnapshot', () => {
    it('returns recorded snapshot', async () => {
      const pool = makePool([ok([snapshotRow])]);
      const svc = new PlatformHealthService(pool);
      const result = await svc.recordSnapshot({
        status: 'healthy',
        components: { database: { status: 'up' } },
      });
      expect(result.id).toBe('snap-1');
      expect(result.status).toBe('healthy');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformHealthService(pool);
      await expect(svc.recordSnapshot({ status: 'healthy', components: {} })).rejects.toThrow(
        'Failed to record health snapshot',
      );
    });
  });

  describe('getLatest', () => {
    it('returns latest snapshot', async () => {
      const pool = makePool([ok([snapshotRow])]);
      const svc = new PlatformHealthService(pool);
      const result = await svc.getLatest();
      expect(result?.status).toBe('healthy');
    });

    it('returns null when no snapshots', async () => {
      const pool = makePool([ok([])]);
      const svc = new PlatformHealthService(pool);
      const result = await svc.getLatest();
      expect(result).toBeNull();
    });
  });

  describe('listSnapshots', () => {
    it('returns list of snapshots', async () => {
      const pool = makePool([ok([snapshotRow])]);
      const svc = new PlatformHealthService(pool);
      const result = await svc.listSnapshots(5);
      expect(result[0]?.id).toBe('snap-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
        string,
        unknown[],
      ][];
      expect((calls[0]?.[1] ?? [])[0]).toBe(5);
    });
  });

  describe('checkHealth', () => {
    it('records healthy snapshot when db query succeeds', async () => {
      // SELECT true AS ok, then INSERT snapshot
      const pool = makePool([ok([{ ok: true }]), ok([snapshotRow])]);
      const svc = new PlatformHealthService(pool);
      const result = await svc.checkHealth();
      expect(result.status).toBe('healthy');
    });

    it('records unhealthy snapshot when db returns no ok', async () => {
      const unhealthy = { ...snapshotRow, status: 'unhealthy' };
      const pool = makePool([ok([{ ok: false }]), ok([unhealthy])]);
      const svc = new PlatformHealthService(pool);
      const result = await svc.checkHealth();
      expect(result.status).toBe('unhealthy');
    });
  });
});
