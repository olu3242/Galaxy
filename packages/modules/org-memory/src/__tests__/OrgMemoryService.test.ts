import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrgMemoryService } from '../OrgMemoryService.js';

const ORG = '00000000-0000-0000-0000-000000000003';

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

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'mem-1',
  organization_id: ORG,
  memory_type: 'decision',
  subject: 'Tech stack',
  content: 'We use TypeScript',
  source: 'board-meeting',
  confidence: '0.9',
  relevance_tags: ['tech', 'stack'],
  is_valid: true,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
});

describe('OrgMemoryService.store', () => {
  it('sets tenant context and inserts memory', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgMemoryService(pool);
    const result = await svc.store(ORG, {
      memoryType: 'decision',
      subject: 'Tech stack',
      content: 'We use TypeScript',
      source: 'board-meeting',
    });
    expect(result.memoryType).toBe('decision');
    expect(result.confidence).toBe(0.9);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('INSERT INTO org_memories');
  });

  it('uses default confidence of 1.0 when not provided', async () => {
    const row = makeRow({ confidence: '1' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgMemoryService(pool);
    await svc.store(ORG, {
      memoryType: 'pattern',
      subject: 'Weekly cadence',
      content: 'We meet on Mondays',
      source: 'ops',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain(1);
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgMemoryService(pool);
    await expect(
      svc.store(ORG, { memoryType: 'lesson', subject: 's', content: 'c', source: 'x' }),
    ).rejects.toThrow('INSERT INTO org_memories returned no row');
  });
});

describe('OrgMemoryService.recall', () => {
  it('returns memories matching basic query', async () => {
    const rows = [makeRow(), makeRow({ id: 'mem-2' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new OrgMemoryService(pool);
    const result = await svc.recall(ORG, {});
    expect(result).toHaveLength(2);
  });

  it('adds type condition when type is specified', async () => {
    const pool = makePool([ok([]), ok([makeRow()])]);
    const svc = new OrgMemoryService(pool);
    await svc.recall(ORG, { type: 'decision' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('memory_type = $2');
    expect(calls[1]?.[1]).toContain('decision');
  });

  it('adds tags condition when tags are specified', async () => {
    const pool = makePool([ok([]), ok([makeRow()])]);
    const svc = new OrgMemoryService(pool);
    await svc.recall(ORG, { tags: ['tech'] });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('relevance_tags &&');
    expect(calls[1]?.[1]).toContainEqual(['tech']);
  });

  it('respects limit parameter', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgMemoryService(pool);
    await svc.recall(ORG, { limit: 5 });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[1]).toContain(5);
  });

  it('includes is_valid filter by default', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgMemoryService(pool);
    await svc.recall(ORG, {});
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    expect(calls[1]?.[0]).toContain('is_valid = TRUE');
  });
});

describe('OrgMemoryService.invalidate', () => {
  it('sets tenant context and issues UPDATE', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgMemoryService(pool);
    await svc.invalidate(ORG, 'mem-1');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('is_valid = FALSE');
    expect(calls[1]?.[1]).toContain('mem-1');
  });
});

describe('OrgMemoryService.getMemoryStats', () => {
  it('aggregates stats from rows', async () => {
    const statsRows = [
      { memory_type: 'decision', count: '3', avg_confidence: '0.8', invalid_count: '1' },
      { memory_type: 'pattern', count: '2', avg_confidence: '0.6', invalid_count: '0' },
    ];
    const pool = makePool([ok([]), ok(statsRows)]);
    const svc = new OrgMemoryService(pool);
    const stats = await svc.getMemoryStats(ORG);
    expect(stats.total).toBe(5);
    expect(stats.byType.decision).toBe(3);
    expect(stats.byType.pattern).toBe(2);
    expect(stats.invalidCount).toBe(1);
    // avg = (0.8*3 + 0.6*2) / 5 = (2.4+1.2)/5 = 0.72
    expect(stats.averageConfidence).toBeCloseTo(0.72);
  });

  it('returns zeroed stats when no memories', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgMemoryService(pool);
    const stats = await svc.getMemoryStats(ORG);
    expect(stats.total).toBe(0);
    expect(stats.averageConfidence).toBe(0);
    expect(stats.invalidCount).toBe(0);
  });
});
