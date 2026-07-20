import type { Pool } from 'pg';
import type { KnowledgeDocument, KnowledgeDocumentRow } from '../types.js';

export interface KnowledgeSearchResult {
  document: KnowledgeDocument;
  relevanceScore: number;
  matchedChunks: string[];
}

interface DocumentWithChunks extends KnowledgeDocumentRow {
  relevance_score: string;
  matched_chunk: string | null;
}

interface FullTextRow extends KnowledgeDocumentRow {
  rank: string;
}

export interface SemanticSearchOptions {
  sourceTypes?: string[];
  tags?: string[];
  limit?: number;
  minRelevance?: number;
}

function rowToDocument(row: KnowledgeDocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    categoryId: row.category_id,
    title: row.title,
    content: row.content,
    status: row.status as KnowledgeDocument['status'],
    authorId: row.author_id,
    tags: row.tags,
    metadata: row.metadata,
    version: row.version,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Provides keyword-based and full-text semantic search over knowledge documents
 * and their chunks. Vector similarity search is handled by the /knowledge/rag
 * route (Voyage AI) when pgvector is available; this service is the fallback and
 * the authoritative non-vector search path.
 */
export class SemanticSearchService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  /**
   * Keyword-based search — returns documents whose title, content, or tags match
   * the query terms. Uses PostgreSQL ILIKE for broad compatibility. Falls back
   * gracefully when the query is empty.
   */
  async search(
    organizationId: string,
    query: string,
    options: SemanticSearchOptions = {},
  ): Promise<KnowledgeSearchResult[]> {
    await this.setTenantContext(organizationId);

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const limit = options.limit ?? 20;
    const minRelevance = options.minRelevance ?? 0;

    const conditions: string[] = ['d.organization_id = $1', "d.status = 'published'"];
    const params: unknown[] = [organizationId];
    let idx = 2;

    // Tag filter
    if (options.tags && options.tags.length > 0) {
      conditions.push(`d.tags && $${String(idx++)}`);
      params.push(options.tags);
    }

    // Source type filter (stored in metadata->>'sourceType')
    if (options.sourceTypes && options.sourceTypes.length > 0) {
      conditions.push(`d.metadata->>'sourceType' = ANY($${String(idx++)})`);
      params.push(options.sourceTypes);
    }

    // Keyword match against title and content
    const queryLike = `%${trimmedQuery}%`;
    conditions.push(`(d.title ILIKE $${String(idx)} OR d.content ILIKE $${String(idx)})`);
    params.push(queryLike);
    idx++;

    // Relevance score: 2 for title match, 1 for content-only match
    const relevanceExpr = `
      CASE
        WHEN d.title ILIKE $${String(idx)} THEN 2.0
        ELSE 1.0
      END`;
    params.push(queryLike);
    idx++;

    // Matched chunk from knowledge_chunks
    params.push(trimmedQuery);
    const chunkMatchParam = idx;
    idx++;

    params.push(queryLike);
    const chunkLikeParam = idx;
    idx++;

    params.push(limit);
    const limitParam = idx;

    const sql = `
      SELECT DISTINCT ON (d.id)
        d.*,
        (${relevanceExpr}) AS relevance_score,
        kc.content AS matched_chunk
      FROM knowledge_documents d
      LEFT JOIN knowledge_chunks kc
        ON kc.document_id = d.id
       AND kc.organization_id = d.organization_id
       AND kc.content ILIKE $${String(chunkLikeParam)}
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.id, relevance_score DESC
      LIMIT $${String(limitParam)}`;

    void chunkMatchParam; // param kept for future vector path

    const result = await this.pool.query<DocumentWithChunks>(sql, params);

    return result.rows
      .map((row) => ({
        document: rowToDocument(row),
        relevanceScore: parseFloat(row.relevance_score),
        matchedChunks: row.matched_chunk ? [row.matched_chunk] : [],
      }))
      .filter((r) => r.relevanceScore >= minRelevance)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Full-text search using PostgreSQL ts_vector / ts_rank. Searches both
   * document text and all associated chunk text, deduplicates on document id.
   */
  async fullTextSearch(
    organizationId: string,
    query: string,
    limit = 20,
  ): Promise<KnowledgeSearchResult[]> {
    await this.setTenantContext(organizationId);

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const result = await this.pool.query<FullTextRow & { matched_chunk: string | null }>(
      `SELECT DISTINCT ON (d.id)
         d.*,
         ts_rank(
           to_tsvector('english', d.title || ' ' || d.content),
           plainto_tsquery('english', $2)
         ) AS rank,
         kc.content AS matched_chunk
       FROM knowledge_documents d
       LEFT JOIN knowledge_chunks kc
         ON kc.document_id = d.id
        AND kc.organization_id = d.organization_id
        AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', $2)
       WHERE d.organization_id = $1
         AND d.status = 'published'
         AND (
           to_tsvector('english', d.title || ' ' || d.content) @@ plainto_tsquery('english', $2)
           OR kc.id IS NOT NULL
         )
       ORDER BY d.id, rank DESC
       LIMIT $3`,
      [organizationId, trimmedQuery, limit],
    );

    return result.rows
      .map((row) => ({
        document: rowToDocument(row),
        relevanceScore: parseFloat(row.rank),
        matchedChunks: row.matched_chunk ? [row.matched_chunk] : [],
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}
