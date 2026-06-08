import type { Pool } from 'pg';
import type { KnowledgeDocument, KnowledgeDocumentRow } from '../types.js';

export interface PublishStatus {
  documentId: string;
  status: KnowledgeDocument['status'];
  publishedAt: string | null;
  version: number;
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

export class KnowledgePublishingService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async publish(organizationId: string, documentId: string): Promise<KnowledgeDocument> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `UPDATE knowledge_documents
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status != 'archived'
       RETURNING *`,
      [documentId, organizationId],
    );

    if (!result.rows[0]) {
      throw new Error(`Document ${documentId} not found or is archived`);
    }

    return rowToDocument(result.rows[0]);
  }

  async unpublish(organizationId: string, documentId: string): Promise<KnowledgeDocument> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `UPDATE knowledge_documents
       SET status = 'draft', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'published'
       RETURNING *`,
      [documentId, organizationId],
    );

    if (!result.rows[0]) {
      throw new Error(`Document ${documentId} not found or is not published`);
    }

    return rowToDocument(result.rows[0]);
  }

  async getPublishStatus(organizationId: string, documentId: string): Promise<PublishStatus> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      'SELECT * FROM knowledge_documents WHERE id = $1 AND organization_id = $2',
      [documentId, organizationId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Document ${documentId} not found`);
    }

    return {
      documentId: row.id,
      status: row.status as KnowledgeDocument['status'],
      publishedAt: row.published_at,
      version: row.version,
    };
  }
}
