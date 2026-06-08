import type { Pool } from 'pg';
import { z } from 'zod';
import type { DocumentStatus, KnowledgeDocument, KnowledgeDocumentRow } from '../types.js';

const CreateDocumentSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  authorId: z.string().uuid(),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateDocumentInput = z.input<typeof CreateDocumentSchema> & {
  organizationId: string;
};

const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateDocumentInput = z.input<typeof UpdateDocumentSchema> & {
  organizationId: string;
  documentId: string;
};

function rowToDocument(row: KnowledgeDocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    categoryId: row.category_id,
    title: row.title,
    content: row.content,
    status: row.status as DocumentStatus,
    authorId: row.author_id,
    tags: row.tags,
    metadata: row.metadata,
    version: row.version,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KnowledgeService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createDocument(input: CreateDocumentInput): Promise<KnowledgeDocument> {
    const parsed = CreateDocumentSchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `INSERT INTO knowledge_documents
         (organization_id, category_id, title, content, status, author_id, tags, metadata)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)
       RETURNING *`,
      [
        input.organizationId,
        parsed.categoryId ?? null,
        parsed.title,
        parsed.content,
        parsed.authorId,
        parsed.tags,
        JSON.stringify(parsed.metadata),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT RETURNING returned no row');
    return rowToDocument(row);
  }

  async updateDocument(input: UpdateDocumentInput): Promise<KnowledgeDocument> {
    const parsed = UpdateDocumentSchema.parse(input);
    await this.setTenantContext(input.organizationId);

    const setClauses: string[] = ['updated_at = NOW()', 'version = version + 1'];
    const params: unknown[] = [];
    let idx = 1;

    if (parsed.title !== undefined) {
      setClauses.push(`title = $${String(idx++)}`);
      params.push(parsed.title);
    }
    if (parsed.content !== undefined) {
      setClauses.push(`content = $${String(idx++)}`);
      params.push(parsed.content);
    }
    if (parsed.categoryId !== undefined) {
      setClauses.push(`category_id = $${String(idx++)}`);
      params.push(parsed.categoryId);
    }
    if (parsed.tags !== undefined) {
      setClauses.push(`tags = $${String(idx++)}`);
      params.push(parsed.tags);
    }
    if (parsed.metadata !== undefined) {
      setClauses.push(`metadata = $${String(idx++)}`);
      params.push(JSON.stringify(parsed.metadata));
    }

    params.push(input.documentId);
    params.push(input.organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `UPDATE knowledge_documents
       SET ${setClauses.join(', ')}
       WHERE id = $${String(idx++)} AND organization_id = $${String(idx)}
       RETURNING *`,
      params,
    );

    if (!result.rows[0]) {
      throw new Error(`Document ${input.documentId} not found`);
    }

    return rowToDocument(result.rows[0]);
  }

  async publishDocument(organizationId: string, documentId: string): Promise<KnowledgeDocument> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `UPDATE knowledge_documents
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'draft'
       RETURNING *`,
      [documentId, organizationId],
    );

    if (!result.rows[0]) {
      throw new Error(`Document ${documentId} not found or not in draft status`);
    }

    return rowToDocument(result.rows[0]);
  }

  async archiveDocument(organizationId: string, documentId: string): Promise<KnowledgeDocument> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `UPDATE knowledge_documents
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [documentId, organizationId],
    );

    if (!result.rows[0]) {
      throw new Error(`Document ${documentId} not found`);
    }

    return rowToDocument(result.rows[0]);
  }

  async getDocument(organizationId: string, documentId: string): Promise<KnowledgeDocument | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      'SELECT * FROM knowledge_documents WHERE id = $1 AND organization_id = $2',
      [documentId, organizationId],
    );

    const row = result.rows[0];
    return row ? rowToDocument(row) : null;
  }

  async listDocuments(
    organizationId: string,
    options: { status?: DocumentStatus; categoryId?: string; limit?: number; offset?: number } = {},
  ): Promise<KnowledgeDocument[]> {
    await this.setTenantContext(organizationId);

    const conditions = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;

    if (options.status) {
      conditions.push(`status = $${String(idx++)}`);
      params.push(options.status);
    }
    if (options.categoryId) {
      conditions.push(`category_id = $${String(idx++)}`);
      params.push(options.categoryId);
    }

    params.push(options.limit ?? 50);
    params.push(options.offset ?? 0);

    const result = await this.pool.query<KnowledgeDocumentRow>(
      `SELECT * FROM knowledge_documents WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT $${String(idx++)} OFFSET $${String(idx)}`,
      params,
    );

    return result.rows.map(rowToDocument);
  }
}
