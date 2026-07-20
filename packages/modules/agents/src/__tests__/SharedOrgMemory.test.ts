import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SharedOrgMemory } from '../memory/SharedOrgMemory.js';
import type { OrgMemoryEntry } from '../memory/SharedOrgMemory.js';

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
const NOW = '2026-01-01T00:00:00.000Z';

const baseRow = {
  id: 'entry-1',
  organization_id: ORG,
  category: 'lesson',
  title: 'Deploy always after tests',
  content: 'Whenever we skip tests, deployments fail.',
  tags: ['devops', 'ci'],
  confidence: '0.9',
  source_type: 'workflow_execution',
  source_id: 'wf-run-99',
  correlation_id: 'corr-abc',
  created_by: 'operations_copilot',
  created_at: NOW,
  updated_at: NOW,
  expires_at: null,
  version: 1,
};

describe('SharedOrgMemory', () => {
  describe('store', () => {
    it('inserts a new entry and returns the mapped record', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new SharedOrgMemory(pool);

      const result = await svc.store({
        organizationId: ORG,
        category: 'lesson',
        title: 'Deploy always after tests',
        content: 'Whenever we skip tests, deployments fail.',
        tags: ['devops', 'ci'],
        confidence: 0.9,
        sourceType: 'workflow_execution',
        sourceId: 'wf-run-99',
        correlationId: 'corr-abc',
        createdBy: 'operations_copilot',
      });

      expect(result.id).toBe('entry-1');
      expect(result.organizationId).toBe(ORG);
      expect(result.category).toBe('lesson');
      expect(result.confidence).toBe(0.9);
      expect(result.tags).toEqual(['devops', 'ci']);
      expect(result.version).toBe(1);
      expect(result.expiresAt).toBeUndefined();

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      // First call sets tenant context
      expect((calls[0] as [string, unknown[]])[0]).toContain('set_config');
      expect((calls[0] as [string, unknown[]])[1]).toEqual(['app.current_tenant', ORG]);
      // Second call inserts
      expect((calls[1] as [string, unknown[]])[0]).toContain('INSERT INTO org_memory_entries');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SharedOrgMemory(pool);

      await expect(
        svc.store({
          organizationId: ORG,
          category: 'decision',
          title: 'T',
          content: 'C',
          tags: [],
          confidence: 0.5,
          sourceType: 'manual',
          sourceId: 'src-1',
          correlationId: 'corr-1',
          createdBy: 'human',
        }),
      ).rejects.toThrow('INSERT into org_memory_entries returned no row');
    });
  });

  describe('retrieve', () => {
    it('returns matching entries for a keyword query', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new SharedOrgMemory(pool);

      const results = await svc.retrieve(ORG, 'tests');

      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('Deploy always after tests');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const selectSql = (calls[1] as [string, unknown[]])[0] as string;
      expect(selectSql).toContain('ILIKE');
      const params = (calls[1] as [string, unknown[]])[1];
      expect(params[1]).toBe('%tests%');
    });

    it('adds category filter when provided', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new SharedOrgMemory(pool);

      await svc.retrieve(ORG, 'tests', 'lesson', 5);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1] as [string, unknown[]])[1] as unknown[];
      expect(params).toContain('lesson');
      expect(params).toContain(5);
    });

    it('returns empty array when no matches found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SharedOrgMemory(pool);

      const results = await svc.retrieve(ORG, 'nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('getLatest', () => {
    it('returns the latest version of an entry', async () => {
      const v2Row = { ...baseRow, version: 2, content: 'Updated content' };
      const pool = makePool([ok([]), ok([v2Row])]);
      const svc = new SharedOrgMemory(pool);

      const result = await svc.getLatest(ORG, 'entry-1');

      expect(result).not.toBeNull();
      expect((result as OrgMemoryEntry).version).toBe(2);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const sql = (calls[1] as [string, unknown[]])[0] as string;
      expect(sql).toContain('ORDER BY version DESC');
      expect(sql).toContain('LIMIT 1');
    });

    it('returns null when entry not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SharedOrgMemory(pool);

      const result = await svc.getLatest(ORG, 'missing-id');
      expect(result).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('returns all versions of an entry ordered by version asc', async () => {
      const v1Row = { ...baseRow, version: 1 };
      const v2Row = { ...baseRow, version: 2 };
      const pool = makePool([ok([]), ok([v1Row, v2Row])]);
      const svc = new SharedOrgMemory(pool);

      const results = await svc.getHistory(ORG, 'entry-1');

      expect(results).toHaveLength(2);
      expect(results[0]?.version).toBe(1);
      expect(results[1]?.version).toBe(2);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const sql = (calls[1] as [string, unknown[]])[0] as string;
      expect(sql).toContain('ORDER BY version ASC');
    });

    it('returns empty array when no history exists', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SharedOrgMemory(pool);

      const results = await svc.getHistory(ORG, 'missing-id');
      expect(results).toEqual([]);
    });
  });

  describe('recordLesson', () => {
    it('stores a lesson-category entry', async () => {
      const pool = makePool([ok([]), ok([baseRow])]);
      const svc = new SharedOrgMemory(pool);

      const result = await svc.recordLesson(ORG, {
        title: 'Deploy always after tests',
        content: 'Whenever we skip tests, deployments fail.',
        confidence: 0.9,
        sourceType: 'workflow_execution',
        sourceId: 'wf-run-99',
        correlationId: 'corr-abc',
        createdBy: 'operations_copilot',
        tags: ['devops', 'ci'],
      });

      expect(result.category).toBe('lesson');
      expect(result.createdBy).toBe('operations_copilot');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const insertParams = (calls[1] as [string, unknown[]])[1] as unknown[];
      expect(insertParams).toContain('lesson');
    });

    it('defaults tags to empty array when not provided', async () => {
      const rowNoTags = { ...baseRow, tags: [] };
      const pool = makePool([ok([]), ok([rowNoTags])]);
      const svc = new SharedOrgMemory(pool);

      const result = await svc.recordLesson(ORG, {
        title: 'A lesson',
        content: 'Some content',
        confidence: 0.7,
        sourceType: 'manual',
        sourceId: 'src-2',
        correlationId: 'corr-2',
        createdBy: 'human',
      });

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const insertParams = (calls[1] as [string, unknown[]])[1] as unknown[];
      expect(insertParams).toContainEqual(result.tags);
    });
  });
});
