import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AgentMemoryService } from '../memory/AgentMemoryService.js';

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

const ORG = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000010';
const NOW = '2026-01-01T00:00:00.000Z';

const memoryRow = {
  id: 'mem-1',
  organization_id: ORG,
  agent_id: AGENT_ID,
  memory_type: 'episodic',
  key: 'last_action',
  value: { action: 'approve' },
  relevance_score: '0.95',
  expires_at: null,
  created_at: NOW,
  updated_at: NOW,
};

describe('AgentMemoryService', () => {
  describe('remember', () => {
    it('upserts a memory entry and returns the mapped record', async () => {
      const pool = makePool([ok([]), ok([memoryRow])]);
      const svc = new AgentMemoryService(pool);

      const result = await svc.remember(ORG, AGENT_ID, 'episodic', 'last_action', {
        action: 'approve',
      });

      expect(result.id).toBe('mem-1');
      expect(result.organizationId).toBe(ORG);
      expect(result.agentId).toBe(AGENT_ID);
      expect(result.memoryType).toBe('episodic');
      expect(result.key).toBe('last_action');
      expect(result.relevanceScore).toBe(0.95);
      expect(result.expiresAt).toBeUndefined();

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      // first call sets tenant context
      expect(calls[0]![0]).toContain('set_config');
      expect(calls[0]![1]).toEqual(['app.current_tenant', ORG]);
    });

    it('passes relevanceScore and expiresAt options', async () => {
      const rowWithExpiry = { ...memoryRow, expires_at: '2027-01-01T00:00:00.000Z' };
      const pool = makePool([ok([]), ok([rowWithExpiry])]);
      const svc = new AgentMemoryService(pool);

      const result = await svc.remember(
        ORG,
        AGENT_ID,
        'semantic',
        'my_key',
        { data: 1 },
        { relevanceScore: 0.7, expiresAt: '2027-01-01T00:00:00.000Z' },
      );

      expect(result.expiresAt).toBe('2027-01-01T00:00:00.000Z');

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const upsertParams = calls[1]![1] as unknown[];
      expect(upsertParams[5]).toBe(0.7);
      expect(upsertParams[6]).toBe('2027-01-01T00:00:00.000Z');
    });

    it('throws when upsert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentMemoryService(pool);

      await expect(svc.remember(ORG, AGENT_ID, 'episodic', 'k', { v: 1 })).rejects.toThrow(
        'Upsert into agent_memory returned no row',
      );
    });
  });

  describe('recall', () => {
    it('returns memories for an agent without type filter', async () => {
      const pool = makePool([ok([]), ok([memoryRow])]);
      const svc = new AgentMemoryService(pool);

      const results = await svc.recall(ORG, AGENT_ID);

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('mem-1');

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const selectParams = calls[1]![1] as unknown[];
      expect(selectParams[0]).toBe(ORG);
      expect(selectParams[1]).toBe(AGENT_ID);
      // no type filter, limit is 3rd param
      expect(selectParams[2]).toBe(50);
    });

    it('adds memory_type filter when provided', async () => {
      const pool = makePool([ok([]), ok([memoryRow])]);
      const svc = new AgentMemoryService(pool);

      await svc.recall(ORG, AGENT_ID, 'episodic', 10);

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const selectParams = calls[1]![1] as unknown[];
      expect(selectParams[2]).toBe('episodic');
      expect(selectParams[3]).toBe(10);
    });

    it('returns empty array when no memories found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentMemoryService(pool);

      const results = await svc.recall(ORG, AGENT_ID);
      expect(results).toEqual([]);
    });
  });

  describe('forget', () => {
    it('deletes the specified memory entry', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentMemoryService(pool);

      await svc.forget(ORG, AGENT_ID, 'episodic', 'last_action');

      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]![0]).toContain('DELETE FROM agent_memory');
      expect(calls[1]![1]).toEqual([ORG, AGENT_ID, 'episodic', 'last_action']);
    });
  });

  describe('purgeExpired', () => {
    it('returns the count of deleted expired memories', async () => {
      const pool = makePool([ok([]), ok([{ count: '7' }])]);
      const svc = new AgentMemoryService(pool);

      const count = await svc.purgeExpired(ORG);
      expect(count).toBe(7);
    });

    it('returns 0 when no rows deleted', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new AgentMemoryService(pool);

      const count = await svc.purgeExpired(ORG);
      expect(count).toBe(0);
    });
  });
});
