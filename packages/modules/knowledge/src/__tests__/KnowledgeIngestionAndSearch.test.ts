/**
 * Knowledge OS — KnowledgeIngestionService · SemanticSearchService
 *
 * Covers: ingestText, chunkContent, generateEmbedding, search (keyword),
 * fullTextSearch, edge cases (empty query, long content, filters).
 *
 * All tests use mock Pool instances; no live DB or network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { KnowledgeIngestionService } from '../services/KnowledgeIngestionService.js';
import { SemanticSearchService } from '../services/SemanticSearchService.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const MEMBER_ID = '00000000-0000-0000-0000-000000000002';
const DOC_ID = '00000000-0000-0000-0000-000000000010';
const CORRELATION = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

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

function docRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DOC_ID,
    organization_id: ORG,
    category_id: null,
    title: 'Onboarding Guide',
    content: 'Follow these steps.',
    status: 'published',
    author_id: MEMBER_ID,
    tags: ['onboarding'],
    metadata: { sourceType: 'document', sourceId: 'src-1', correlationId: CORRELATION },
    version: 1,
    published_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ── KnowledgeIngestionService ─────────────────────────────────────────────────

describe('KnowledgeIngestionService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ingestText', () => {
    it('inserts document and chunks, returns KnowledgeDocument', async () => {
      const pool = makePool([
        ok([]), // setTenantContext
        ok([docRow()]), // INSERT knowledge_documents
        ok([]), // INSERT knowledge_chunks
        // scheduleEmbedding is swallowed on error (no Redis in test env)
      ]);

      const service = new KnowledgeIngestionService(pool);
      const result = await service.ingestText({
        organizationId: ORG,
        title: 'Onboarding Guide',
        content: 'Follow these steps.',
        sourceType: 'document',
        sourceId: 'src-1',
        tags: ['onboarding'],
        createdBy: MEMBER_ID,
        correlationId: CORRELATION,
      });

      expect(result.id).toBe(DOC_ID);
      expect(result.organizationId).toBe(ORG);
      expect(result.status).toBe('published');
      expect(result.tags).toEqual(['onboarding']);

      const poolMock = pool.query as ReturnType<typeof vi.fn>;
      // setTenantContext + INSERT doc + INSERT chunks = 3 calls
      expect(poolMock.mock.calls.length).toBeGreaterThanOrEqual(3);

      // First real query should be set_config
      const firstCall = poolMock.mock.calls[0] as unknown[];
      expect(firstCall[0]).toContain('set_config');
    });

    it('throws if INSERT RETURNING returns no row', async () => {
      const pool = makePool([
        ok([]), // setTenantContext
        ok([]), // INSERT returns nothing
      ]);

      const service = new KnowledgeIngestionService(pool);
      await expect(
        service.ingestText({
          organizationId: ORG,
          title: 'Bad',
          content: 'Content',
          sourceType: 'workflow',
          sourceId: 'wf-1',
          tags: [],
          createdBy: MEMBER_ID,
          correlationId: CORRELATION,
        }),
      ).rejects.toThrow('INSERT RETURNING returned no row');
    });
  });

  describe('chunkContent', () => {
    it('returns single chunk when content fits within maxChunkSize', () => {
      const service = new KnowledgeIngestionService({} as Pool);
      const result = service.chunkContent('Hello world', 1200);
      expect(result).toEqual(['Hello world']);
    });

    it('returns empty array for blank content', () => {
      const service = new KnowledgeIngestionService({} as Pool);
      expect(service.chunkContent('   ', 1200)).toEqual([]);
    });

    it('splits large content into multiple chunks not exceeding maxChunkSize', () => {
      const service = new KnowledgeIngestionService({} as Pool);
      // Build a string longer than 100 chars to force splitting
      const longParagraph = 'Lorem ipsum dolor sit amet. '.repeat(10); // ~280 chars
      const chunks = service.chunkContent(longParagraph, 100);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }
    });

    it('preserves paragraph boundaries when possible', () => {
      const service = new KnowledgeIngestionService({} as Pool);
      const content = 'First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph content.';
      const chunks = service.chunkContent(content, 50);
      // Each paragraph is ~25 chars so they should be individual chunks
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('handles oversized single paragraph with sentence splitting', () => {
      const service = new KnowledgeIngestionService({} as Pool);
      const bigParagraph =
        'This is the first sentence. This is the second sentence. This is the third sentence. This is the fourth sentence.';
      const chunks = service.chunkContent(bigParagraph, 60);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('generateEmbedding', () => {
    it('returns empty array when ANTHROPIC_API_KEY is not set', async () => {
      const service = new KnowledgeIngestionService({} as Pool);
      const result = await service.generateEmbedding('test text');
      expect(result).toEqual([]);
    });

    it('returns array of 1536 numbers when API key is present (mocked fetch)', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const mockResponse = {
        ok: true,
        json: async () => ({ content: [{ text: '0' }] }),
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockResponse as Response,
      );

      const service = new KnowledgeIngestionService({} as Pool);
      const result = await service.generateEmbedding('test text');

      expect(result).toHaveLength(1536);
      expect(result.every((v) => v === 0)).toBe(true);
      fetchSpy.mockRestore();
    });

    it('returns empty array on API failure', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const mockResponse = { ok: false, status: 500 };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockResponse as Response,
      );

      const service = new KnowledgeIngestionService({} as Pool);
      const result = await service.generateEmbedding('test text');

      expect(result).toEqual([]);
      fetchSpy.mockRestore();
    });
  });
});

// ── SemanticSearchService ─────────────────────────────────────────────────────

describe('SemanticSearchService', () => {
  describe('search (keyword)', () => {
    it('returns results mapped with relevanceScore', async () => {
      const row = {
        ...docRow(),
        relevance_score: '2.0',
        matched_chunk: 'Follow these steps.',
      };
      const pool = makePool([
        ok([]), // setTenantContext
        ok([row]),
      ]);

      const service = new SemanticSearchService(pool);
      const results = await service.search(ORG, 'onboarding');

      expect(results).toHaveLength(1);
      expect(results[0]?.relevanceScore).toBe(2.0);
      expect(results[0]?.matchedChunks).toEqual(['Follow these steps.']);
      expect(results[0]?.document.id).toBe(DOC_ID);
    });

    it('returns empty array for empty query', async () => {
      const pool = makePool([]);
      const service = new SemanticSearchService(pool);
      const results = await service.search(ORG, '');
      expect(results).toEqual([]);
    });

    it('returns empty array for whitespace query', async () => {
      const pool = makePool([]);
      const service = new SemanticSearchService(pool);
      const results = await service.search(ORG, '   ');
      expect(results).toEqual([]);
    });

    it('filters by minRelevance', async () => {
      const rows = [
        { ...docRow({ id: 'doc-low' }), relevance_score: '0.5', matched_chunk: null },
        { ...docRow({ id: 'doc-high' }), relevance_score: '2.0', matched_chunk: 'chunk' },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const service = new SemanticSearchService(pool);
      const results = await service.search(ORG, 'test', { minRelevance: 1.0 });
      expect(results.every((r) => r.relevanceScore >= 1.0)).toBe(true);
    });

    it('passes tag filter to query parameters', async () => {
      const pool = makePool([ok([]), ok([])]);
      const service = new SemanticSearchService(pool);
      await service.search(ORG, 'test', { tags: ['onboarding'] });

      const poolMock = pool.query as ReturnType<typeof vi.fn>;
      // Second call is the actual search
      const searchCall = poolMock.mock.calls[1] as unknown[];
      const paramsArray = searchCall[1] as unknown[];
      expect(paramsArray).toContainEqual(['onboarding']);
    });

    it('returned results are sorted by relevanceScore descending', async () => {
      const rows = [
        { ...docRow({ id: 'doc-a' }), relevance_score: '1.0', matched_chunk: null },
        { ...docRow({ id: 'doc-b' }), relevance_score: '2.0', matched_chunk: null },
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const service = new SemanticSearchService(pool);
      const results = await service.search(ORG, 'query');
      expect(results[0]?.relevanceScore).toBeGreaterThanOrEqual(results[1]?.relevanceScore ?? 0);
    });
  });

  describe('fullTextSearch', () => {
    it('returns documents with ts_rank score', async () => {
      const row = {
        ...docRow(),
        rank: '0.0759',
        matched_chunk: null,
      };
      const pool = makePool([ok([]), ok([row])]);
      const service = new SemanticSearchService(pool);
      const results = await service.fullTextSearch(ORG, 'onboarding');

      expect(results).toHaveLength(1);
      expect(results[0]?.relevanceScore).toBeCloseTo(0.0759, 3);
    });

    it('returns empty array for empty query', async () => {
      const pool = makePool([]);
      const service = new SemanticSearchService(pool);
      expect(await service.fullTextSearch(ORG, '')).toEqual([]);
    });

    it('uses parameterized queries (no interpolation)', async () => {
      const pool = makePool([ok([]), ok([])]);
      const service = new SemanticSearchService(pool);
      await service.fullTextSearch(ORG, "'; DROP TABLE knowledge_documents; --");

      const poolMock = pool.query as ReturnType<typeof vi.fn>;
      const searchCall = poolMock.mock.calls[1] as unknown[];
      // The query string itself must NOT contain the user input directly
      const queryString = searchCall[0] as string;
      expect(queryString).not.toContain('DROP TABLE');
    });

    it('sets tenant context before querying', async () => {
      const pool = makePool([ok([]), ok([])]);
      const service = new SemanticSearchService(pool);
      await service.fullTextSearch(ORG, 'test');

      const poolMock = pool.query as ReturnType<typeof vi.fn>;
      const firstCall = poolMock.mock.calls[0] as unknown[];
      expect(firstCall[0]).toContain('set_config');
      const configParams = firstCall[1] as string[];
      expect(configParams[1]).toBe(ORG);
    });
  });
});
