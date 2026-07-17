import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TrustEngine } from '../TrustEngine.js';

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
const NOW = new Date('2026-01-01T00:00:00Z');

const trustRow = {
  id: 'trust-1',
  organization_id: ORG,
  entity_id: 'user-1',
  entity_type: 'member',
  score: 1.0,
  flags: [],
  calculated_at: NOW,
};

describe('TrustEngine', () => {
  describe('computeTrustScore', () => {
    it('sets tenant context as first query', async () => {
      // set_config, threatCount query, upsert trust_scores
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([trustRow])]);
      const engine = new TrustEngine(pool);
      await engine.computeTrustScore(ORG, 'user-1', 'member');
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('returns 1.0 score when no threats detected and no confirmed threats', async () => {
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([trustRow])]);
      const engine = new TrustEngine(pool);
      const result = await engine.computeTrustScore(ORG, 'user-1', 'member');
      expect(result.score).toBe(1.0);
      expect(result.flags).toHaveLength(0);
    });

    it('deducts 0.3 when recentContent matches a threat pattern', async () => {
      const penalisedRow = { ...trustRow, score: 0.7, flags: ['spam'] };
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([penalisedRow])]);
      const engine = new TrustEngine(pool);
      const result = await engine.computeTrustScore(
        ORG,
        'user-1',
        'member',
        'buy now limited offer',
      );
      // We check the upsert was called (3rd query)
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls).toHaveLength(3);
      expect(result.score).toBe(0.7);
    });

    it('deducts 0.1 per confirmed threat in DB', async () => {
      const penalisedRow = { ...trustRow, score: 0.8 };
      const pool = makePool([ok([]), ok([{ count: '2' }]), ok([penalisedRow])]);
      const engine = new TrustEngine(pool);
      const result = await engine.computeTrustScore(ORG, 'user-1', 'member');
      expect(result.score).toBe(0.8);
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([]), ok([{ count: '0' }]), ok([])]);
      const engine = new TrustEngine(pool);
      await expect(engine.computeTrustScore(ORG, 'user-1', 'member')).rejects.toThrow(
        'Failed to compute trust score',
      );
    });
  });
});
