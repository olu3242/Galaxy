/**
 * Knowledge OS — KnowledgePublishingService · KnowledgeSearchService · KnowledgeVersionService
 *
 * Covers: publish · unpublish · getPublishStatus · search (with/without filters) ·
 *         rankResults · filterByPermission · logSearchAudit ·
 *         createVersion · getVersions · restoreVersion
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { KnowledgePublishingService } from '../services/KnowledgePublishingService.js';
import { KnowledgeSearchService } from '../services/KnowledgeSearchService.js';
import { KnowledgeVersionService } from '../services/KnowledgeVersionService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const DOC_ID = '00000000-0000-0000-0000-000000000010';
const MEMBER_ID = '00000000-0000-0000-0000-000000000020';
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

function docRow(overrides: Partial<{ status: string; published_at: string | null }> = {}) {
  return {
    id: DOC_ID,
    organization_id: ORG,
    category_id: null,
    title: 'Getting Started Guide',
    content: 'Follow these steps to get started.',
    status: overrides.status ?? 'published',
    author_id: MEMBER_ID,
    tags: ['onboarding'],
    metadata: {},
    version: 1,
    published_at: overrides.published_at ?? NOW,
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── KnowledgePublishingService ───────────────────────────────────────────────

describe('KnowledgePublishingService.publish', () => {
  it('sets tenant context before UPDATE', async () => {
    const pool = makePool([ok([]), ok([docRow()])]);
    const svc = new KnowledgePublishingService(pool);
    await svc.publish(ORG, DOC_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0] as [string, unknown[]])[1]).toContain(ORG);
  });

  it('returns the published document', async () => {
    const pool = makePool([ok([]), ok([docRow({ status: 'published', published_at: NOW })])]);
    const svc = new KnowledgePublishingService(pool);
    const result = await svc.publish(ORG, DOC_ID);

    expect(result.id).toBe(DOC_ID);
    expect(result.status).toBe('published');
    expect(result.publishedAt).toBe(NOW);
  });

  it('throws when document is not found or is archived', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgePublishingService(pool);
    await expect(svc.publish(ORG, 'nonexistent')).rejects.toThrow('not found or is archived');
  });
});

describe('KnowledgePublishingService.unpublish', () => {
  it('returns document with draft status', async () => {
    const row = { ...docRow(), status: 'draft', published_at: null };
    const pool = makePool([ok([]), ok([row])]);
    const svc = new KnowledgePublishingService(pool);
    const result = await svc.unpublish(ORG, DOC_ID);

    expect(result.status).toBe('draft');
    expect(result.publishedAt).toBeNull();
  });

  it('throws when document is not found or is not published', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgePublishingService(pool);
    await expect(svc.unpublish(ORG, DOC_ID)).rejects.toThrow('not found or is not published');
  });
});

describe('KnowledgePublishingService.getPublishStatus', () => {
  it('returns status object with documentId and version', async () => {
    const pool = makePool([ok([]), ok([docRow()])]);
    const svc = new KnowledgePublishingService(pool);
    const status = await svc.getPublishStatus(ORG, DOC_ID);

    expect(status.documentId).toBe(DOC_ID);
    expect(status.status).toBe('published');
    expect(status.version).toBe(1);
    expect(status.publishedAt).toBe(NOW);
  });

  it('throws when document not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgePublishingService(pool);
    await expect(svc.getPublishStatus(ORG, 'bad-id')).rejects.toThrow('not found');
  });
});

// ─── KnowledgeSearchService ───────────────────────────────────────────────────

describe('KnowledgeSearchService.search', () => {
  it('sets tenant context first', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeSearchService(pool);
    await svc.search(ORG, 'onboarding');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns empty array when no results', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeSearchService(pool);
    const result = await svc.search(ORG, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('returns mapped SearchResult with document and rank', async () => {
    const row = { ...docRow(), rank: '0.75' };
    const pool = makePool([ok([]), ok([row])]);
    const svc = new KnowledgeSearchService(pool);
    const result = await svc.search(ORG, 'getting started');

    expect(result).toHaveLength(1);
    expect(result[0]?.document.id).toBe(DOC_ID);
    expect(result[0]?.rank).toBe(0.75);
  });

  it('includes categoryId in query params when provided', async () => {
    const CAT = '00000000-0000-0000-0000-000000000099';
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeSearchService(pool);
    await svc.search(ORG, 'help', { categoryId: CAT });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(CAT);
  });

  it('includes tags in query params when provided', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeSearchService(pool);
    await svc.search(ORG, 'help', { tags: ['onboarding', 'guide'] });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContainEqual(['onboarding', 'guide']);
  });

  it('uses default limit of 20', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeSearchService(pool);
    await svc.search(ORG, 'help');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(20);
  });
});

describe('KnowledgeSearchService.rankResults', () => {
  it('returns results sorted by rank descending', () => {
    const svc = new KnowledgeSearchService(makePool([]));
    const doc = docRow();
    const results = [
      { document: { ...doc, id: 'a' } as never, rank: 0.3 },
      { document: { ...doc, id: 'b' } as never, rank: 0.9 },
      { document: { ...doc, id: 'c' } as never, rank: 0.5 },
    ];
    const ranked = svc.rankResults(results);
    expect(ranked[0]?.rank).toBe(0.9);
    expect(ranked[2]?.rank).toBe(0.3);
  });
});

describe('KnowledgeSearchService.filterByPermission', () => {
  it('keeps only published documents', () => {
    const svc = new KnowledgeSearchService(makePool([]));
    const results = [
      { document: { ...docRow(), status: 'published' } as never, rank: 0.8 },
      { document: { ...docRow(), status: 'draft' } as never, rank: 0.6 },
    ];
    const filtered = svc.filterByPermission(results, MEMBER_ID);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.document.status).toBe('published');
  });
});

describe('KnowledgeSearchService.logSearchAudit', () => {
  it('inserts into knowledge_activities', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeSearchService(pool);
    await svc.logSearchAudit(ORG, MEMBER_ID, 'onboarding', 5);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[0]).toContain('knowledge_activities');
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(MEMBER_ID);
  });
});

// ─── KnowledgeVersionService ──────────────────────────────────────────────────

const VERSION_ROW = {
  id: '00000000-0000-0000-0000-000000000030',
  organization_id: ORG,
  document_id: DOC_ID,
  version: 2,
  content: 'Updated content.',
  changed_by: MEMBER_ID,
  change_note: 'Revised introduction',
  created_at: NOW,
};

describe('KnowledgeVersionService.createVersion', () => {
  it('sets tenant context before INSERT', async () => {
    const pool = makePool([ok([]), ok([VERSION_ROW])]);
    const svc = new KnowledgeVersionService(pool);
    await svc.createVersion({
      organizationId: ORG,
      documentId: DOC_ID,
      content: 'Updated content.',
      changedBy: MEMBER_ID,
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('returns mapped KnowledgeVersion', async () => {
    const pool = makePool([ok([]), ok([VERSION_ROW])]);
    const svc = new KnowledgeVersionService(pool);
    const result = await svc.createVersion({
      organizationId: ORG,
      documentId: DOC_ID,
      content: 'Updated content.',
      changedBy: MEMBER_ID,
    });

    expect(result.version).toBe(2);
    expect(result.documentId).toBe(DOC_ID);
    expect(result.changedBy).toBe(MEMBER_ID);
    expect(result.changeNote).toBe('Revised introduction');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeVersionService(pool);
    await expect(
      svc.createVersion({
        organizationId: ORG,
        documentId: DOC_ID,
        content: 'Content',
        changedBy: MEMBER_ID,
      }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });

  it('throws on Zod validation failure (empty content)', async () => {
    const pool = makePool([]);
    const svc = new KnowledgeVersionService(pool);
    await expect(
      svc.createVersion({
        organizationId: ORG,
        documentId: DOC_ID,
        content: '',
        changedBy: MEMBER_ID,
      }),
    ).rejects.toThrow();
  });

  it('throws on Zod validation failure (invalid documentId)', async () => {
    const pool = makePool([]);
    const svc = new KnowledgeVersionService(pool);
    await expect(
      svc.createVersion({
        organizationId: ORG,
        documentId: 'not-a-uuid',
        content: 'Valid content',
        changedBy: MEMBER_ID,
      }),
    ).rejects.toThrow();
  });
});

describe('KnowledgeVersionService.getVersions', () => {
  it('returns all versions for a document in descending order', async () => {
    const v1 = { ...VERSION_ROW, version: 1 };
    const v2 = { ...VERSION_ROW, version: 2 };
    const pool = makePool([ok([]), ok([v2, v1])]);
    const svc = new KnowledgeVersionService(pool);
    const result = await svc.getVersions(ORG, DOC_ID);

    expect(result).toHaveLength(2);
    expect(result[0]?.version).toBe(2);
    expect(result[1]?.version).toBe(1);
  });

  it('returns empty array when no versions exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeVersionService(pool);
    const result = await svc.getVersions(ORG, DOC_ID);
    expect(result).toHaveLength(0);
  });
});

describe('KnowledgeVersionService.restoreVersion', () => {
  it('throws when target version is not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new KnowledgeVersionService(pool);
    await expect(svc.restoreVersion(ORG, DOC_ID, 99, MEMBER_ID)).rejects.toThrow('not found');
  });

  it('creates a new version with restored content', async () => {
    // Sequence: setTenant(1), getVersion(1), UPDATE(1), setTenant(2), INSERT(1)
    const pool = makePool([
      ok([]), // set_config for restoreVersion
      ok([VERSION_ROW]), // SELECT version
      ok([]), // UPDATE document
      ok([]), // set_config inside nested createVersion
      ok([{ ...VERSION_ROW, version: 3, change_note: 'Restored from version 2' }]),
    ]);
    const svc = new KnowledgeVersionService(pool);
    const result = await svc.restoreVersion(ORG, DOC_ID, 2, MEMBER_ID);

    expect(result.changeNote).toContain('Restored from version 2');
  });
});
