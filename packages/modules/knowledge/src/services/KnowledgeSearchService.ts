import type { Pool } from 'pg';
import type { KnowledgeDocument, KnowledgeDocumentRow } from '../types.js';

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

export interface SearchResult {
  document: KnowledgeDocument;
  rank: number;
}

export class KnowledgeSearchService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async search(
    organizationId: string,
    query: string,
    options: { categoryId?: string; tags?: string[]; limit?: number } = {},
  ): Promise<SearchResult[]> {
    await this.setTenantContext(organizationId);

    const conditions = [
      'organization_id = $1',
      "status = 'published'",
      "(to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $2))",
    ];
    const params: unknown[] = [organizationId, query];
    let idx = 3;

    if (options.categoryId) {
      conditions.push(`category_id = $${idx++}`);
      params.push(options.categoryId);
    }
    if (options.tags && options.tags.length > 0) {
      conditions.push(`tags && $${idx++}`);
      params.push(options.tags);
    }

    params.push(options.limit ?? 20);

    const result = await this.pool.query<KnowledgeDocumentRow & { rank: string }>(
      `SELECT *,
              ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $2)) as rank
       FROM knowledge_documents
       WHERE ${conditions.join(' AND ')}
       ORDER BY rank DESC
       LIMIT $${idx}`,
      params,
    );

    return result.rows.map((row) => ({
      document: rowToDocument(row),
      rank: parseFloat(row.rank),
    }));
  }

  rankResults(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => b.rank - a.rank);
  }

  filterByPermission(results: SearchResult[], _memberId: string): SearchResult[] {
    return results.filter((r) => r.document.status === 'published');
  }

  async logSearchAudit(
    organizationId: string,
    memberId: string,
    query: string,
    resultCount: number,
  ): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      `INSERT INTO knowledge_activities
         (organization_id, document_id, actor_id, action, metadata)
       VALUES ($1, $2, $3, 'search', $4)`,
      [
        organizationId,
        '00000000-0000-0000-0000-000000000000',
        memberId,
        JSON.stringify({ query, resultCount }),
      ],
    );
  }
}
