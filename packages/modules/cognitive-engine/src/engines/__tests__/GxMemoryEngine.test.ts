import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GxMemoryEngine } from '../GxMemoryEngine.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const AGENT = 'agent-001';

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

function makeMemoryRow(
  overrides: Partial<{
    id: string;
    agent_id: string;
    organization_id: string;
    scope: string;
    key: string;
    value: Record<string, unknown>;
    relevance_score: number;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  }> = {},
) {
  return {
    id: 'mem-1',
    agent_id: AGENT,
    organization_id: ORG,
    scope: 'short_term',
    key: 'test-key',
    value: { foo: 'bar' },
    relevance_score: 0.5,
    expires_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('GxMemoryEngine.write', () => {
  it('sets tenant context as first query', async () => {
    const row = makeMemoryRow();
    const pool = makePool([ok([]), ok([row])]);
    const engine = new GxMemoryEngine(pool);
    await engine.write({
      agentId: AGENT,
      organizationId: ORG,
      scope: 'short_term',
      key: 'k',
      value: {},
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns a MemoryEntry on success', async () => {
    const row = makeMemoryRow({ key: 'my-key', value: { data: 1 } });
    const pool = makePool([ok([]), ok([row])]);
    const engine = new GxMemoryEngine(pool);
    const result = await engine.write({
      agentId: AGENT,
      organizationId: ORG,
      scope: 'short_term',
      key: 'my-key',
      value: { data: 1 },
    });
    expect(result.key).toBe('my-key');
    expect(result.agentId).toBe(AGENT);
    expect(result.organizationId).toBe(ORG);
    expect(result.scope).toBe('short_term');
    expect(result.expiresAt).toBeUndefined();
  });

  it('sets expiresAt when row has expires_at', async () => {
    const expiresAt = '2026-12-31T00:00:00Z';
    const row = makeMemoryRow({ expires_at: expiresAt });
    const pool = makePool([ok([]), ok([row])]);
    const engine = new GxMemoryEngine(pool);
    const result = await engine.write({
      agentId: AGENT,
      organizationId: ORG,
      scope: 'short_term',
      key: 'k',
      value: {},
      ttlSeconds: 3600,
    });
    expect(result.expiresAt).toBe(expiresAt);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxMemoryEngine(pool);
    await expect(
      engine.write({
        agentId: AGENT,
        organizationId: ORG,
        scope: 'short_term',
        key: 'k',
        value: {},
      }),
    ).rejects.toThrow('Memory write returned no row');
  });
});

describe('GxMemoryEngine.read', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxMemoryEngine(pool);
    await engine.read({ agentId: AGENT, organizationId: ORG });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped MemoryEntry array', async () => {
    const row = makeMemoryRow({ scope: 'long_term' });
    const pool = makePool([ok([]), ok([row])]);
    const engine = new GxMemoryEngine(pool);
    const results = await engine.read({ agentId: AGENT, organizationId: ORG });
    expect(results).toHaveLength(1);
    expect(results[0]?.scope).toBe('long_term');
    expect(results[0]?.expiresAt).toBeUndefined();
  });

  it('returns empty array when no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxMemoryEngine(pool);
    const results = await engine.read({ agentId: AGENT, organizationId: ORG });
    expect(results).toHaveLength(0);
  });

  it('includes expiresAt in mapped entry when present', async () => {
    const row = makeMemoryRow({ expires_at: '2027-01-01T00:00:00Z' });
    const pool = makePool([ok([]), ok([row])]);
    const engine = new GxMemoryEngine(pool);
    const results = await engine.read({ agentId: AGENT, organizationId: ORG });
    expect(results[0]?.expiresAt).toBe('2027-01-01T00:00:00Z');
  });
});

describe('GxMemoryEngine.forget', () => {
  it('sets tenant context and deletes', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxMemoryEngine(pool);
    await engine.forget(AGENT, ORG, 'my-key', 'short_term');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('DELETE FROM agent_memories');
  });
});

describe('GxMemoryEngine.consolidate', () => {
  it('sets tenant context and returns promoted count', async () => {
    const pool = makePool([ok([]), ok([{ count: '3' }])]);
    const engine = new GxMemoryEngine(pool);
    const count = await engine.consolidate(AGENT, ORG);
    expect(count).toBe(3);
  });

  it('returns 0 when no rows returned', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxMemoryEngine(pool);
    const count = await engine.consolidate(AGENT, ORG);
    expect(count).toBe(0);
  });
});
