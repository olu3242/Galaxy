import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { KnowledgeService } from '../services/KnowledgeService.js';

function makePool(rows: unknown[] = []): Pool {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult);
  return { query } as unknown as Pool;
}

const organizationId = '00000000-0000-0000-0000-000000000001';
const authorId = '00000000-0000-0000-0000-000000000002';

function makeDocumentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    organization_id: organizationId,
    category_id: null,
    title: 'Test Document',
    content: 'Test content',
    status: 'draft',
    author_id: authorId,
    tags: [],
    metadata: {},
    version: 1,
    published_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('KnowledgeService', () => {
  describe('createDocument', () => {
    it('sets tenant context before inserting', async () => {
      const row = makeDocumentRow();
      const pool = makePool([row]);
      const service = new KnowledgeService(pool);

      const result = await service.createDocument({
        organizationId,
        title: 'Test Document',
        content: 'Test content',
        authorId,
      });

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', organizationId]);
      expect(result.title).toBe('Test Document');
      expect(result.status).toBe('draft');
    });

    it('throws on invalid input (empty title)', async () => {
      const pool = makePool();
      const service = new KnowledgeService(pool);

      await expect(
        service.createDocument({
          organizationId,
          title: '',
          content: 'content',
          authorId,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getDocument', () => {
    it('sets tenant context and returns null when not found', async () => {
      const pool = makePool([]);
      const service = new KnowledgeService(pool);

      const result = await service.getDocument(organizationId, 'non-existent');

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(result).toBeNull();
    });

    it('returns document when found', async () => {
      const row = makeDocumentRow({ id: 'doc-abc' });
      const pool = makePool([row]);
      const service = new KnowledgeService(pool);

      const result = await service.getDocument(organizationId, 'doc-abc');
      expect(result?.id).toBe('doc-abc');
    });
  });

  describe('publishDocument', () => {
    it('throws when document not found or not draft', async () => {
      const pool = makePool([]);
      const service = new KnowledgeService(pool);

      await expect(service.publishDocument(organizationId, 'non-existent')).rejects.toThrow();
    });

    it('sets tenant context before publishing', async () => {
      const row = makeDocumentRow({
        status: 'published',
        published_at: '2026-01-01T00:00:00.000Z',
      });
      const pool = makePool([row]);
      const service = new KnowledgeService(pool);

      await service.publishDocument(organizationId, 'doc-1');

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', organizationId]);
    });
  });

  describe('tenant isolation', () => {
    it('always passes organizationId as parameter (not interpolated)', async () => {
      const pool = makePool([]);
      const service = new KnowledgeService(pool);

      await service.listDocuments(organizationId);

      const calls = vi.mocked(pool.query).mock.calls;
      for (const call of calls) {
        if (typeof call[0] === 'string' && call[0].includes('organization_id')) {
          expect(call[0]).not.toContain(organizationId);
          expect(call[1]).toContain(organizationId);
        }
      }
    });
  });
});
