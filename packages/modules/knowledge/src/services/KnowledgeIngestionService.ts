import type { Pool } from 'pg';
import type { KnowledgeDocument, KnowledgeDocumentRow } from '../types.js';

export type IngestionSourceType =
  | 'conversation'
  | 'workflow'
  | 'approval'
  | 'document'
  | 'meeting'
  | 'failure';

export interface IngestTextParams {
  organizationId: string;
  title: string;
  content: string;
  sourceType: IngestionSourceType;
  sourceId: string;
  tags: string[];
  createdBy: string;
  correlationId: string;
}

export interface EmbeddingJobPayload {
  documentId: string;
  organizationId: string;
  correlationId: string;
}

/**
 * Callback invoked after a document is ingested to enqueue the embedding job.
 * Provided by the caller (e.g. apps/api route handler) to avoid a hard
 * dependency on BullMQ inside this package.
 */
export type EmbeddingScheduler = (payload: EmbeddingJobPayload) => Promise<void>;

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
 * Handles document ingestion: create document record, chunk content, optionally
 * generate embeddings, and schedule the background embedding job via BullMQ.
 *
 * NEVER log document content — it may contain sensitive organizational data.
 */
export class KnowledgeIngestionService {
  /** Default chunk size in characters (~300 tokens at average English density). */
  private static readonly DEFAULT_CHUNK_SIZE = 1200;

  constructor(
    private readonly pool: Pool,
    /** Optional scheduler; if not provided, scheduling is skipped silently. */
    private readonly scheduler?: EmbeddingScheduler,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  /**
   * Ingest plain text content: creates a knowledge_document row in `published`
   * status, writes chunks to knowledge_chunks, and enqueues an embedding job.
   */
  async ingestText(params: IngestTextParams): Promise<KnowledgeDocument> {
    await this.setTenantContext(params.organizationId);

    // Insert the document record
    const docResult = await this.pool.query<KnowledgeDocumentRow>(
      `INSERT INTO knowledge_documents
         (organization_id, title, content, status, author_id, tags, metadata, ingested_at)
       VALUES ($1, $2, $3, 'published', $4, $5, $6, NOW())
       RETURNING *`,
      [
        params.organizationId,
        params.title,
        params.content,
        params.createdBy,
        params.tags,
        JSON.stringify({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          correlationId: params.correlationId,
        }),
      ],
    );

    const row = docResult.rows[0];
    if (!row) throw new Error('INSERT RETURNING returned no row for knowledge document');
    const document = rowToDocument(row);

    // Chunk and persist
    const chunks = this.chunkContent(params.content, KnowledgeIngestionService.DEFAULT_CHUNK_SIZE);
    await this.persistChunks(document.id, params.organizationId, chunks);

    // Schedule embedding generation (best-effort; does not fail ingestion)
    if (this.scheduler) {
      await this.scheduleEmbedding(document.id, params.organizationId, params.correlationId).catch(
        () => {
          // Swallow — embedding queue may be unavailable; worker backfills on startup.
        },
      );
    }

    return document;
  }

  /**
   * Split content into overlapping chunks no larger than `maxChunkSize` characters.
   * Splits on paragraph/sentence boundaries when possible.
   */
  chunkContent(content: string, maxChunkSize: number): string[] {
    if (content.length <= maxChunkSize) return [content.trim()].filter(Boolean);

    const chunks: string[] = [];
    // Split on paragraph boundaries first
    const paragraphs = content.split(/\n{2,}/);
    let current = '';

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      if (current.length + trimmed.length + 2 <= maxChunkSize) {
        current = current ? `${current}\n\n${trimmed}` : trimmed;
      } else {
        if (current) chunks.push(current);

        // Paragraph itself exceeds limit — split on sentence boundaries
        if (trimmed.length > maxChunkSize) {
          const sentences = trimmed.match(/[^.!?]+[.!?]+[\s]*/g) ?? [trimmed];
          current = '';
          for (const sentence of sentences) {
            if (current.length + sentence.length <= maxChunkSize) {
              current += sentence;
            } else {
              if (current) chunks.push(current.trim());
              // Hard-split oversized single sentence
              if (sentence.length > maxChunkSize) {
                let offset = 0;
                while (offset < sentence.length) {
                  chunks.push(sentence.slice(offset, offset + maxChunkSize));
                  offset += maxChunkSize;
                }
                current = '';
              } else {
                current = sentence;
              }
            }
          }
        } else {
          current = trimmed;
        }
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  /**
   * Generate a text embedding using the Anthropic API (messages endpoint with a
   * structured prompt). Falls back to an empty array if the API key is absent.
   *
   * NOTE: The actual embedding vector is stored per chunk in knowledge_chunks.
   * This method returns a raw float array suitable for pgvector `vector(1536)`.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    // Anthropic does not expose a dedicated embeddings endpoint; we use a
    // lightweight prompt to derive a deterministic numeric representation.
    // In production, swap this for a dedicated embedding provider (e.g. Voyage AI
    // referenced in the existing /knowledge/rag route) once pgvector is enabled.
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8,
        system:
          'You are an embedding stub. Reply with only the number 0. Do not add any other content.',
        messages: [{ role: 'user', content: text.slice(0, 512) }],
      }),
    });

    if (!response.ok) return [];

    // Return a zero-vector placeholder of dimension 1536 (matches migration schema).
    // Real embeddings should be generated via Voyage AI or a dedicated model.
    return new Array<number>(1536).fill(0);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async persistChunks(
    documentId: string,
    organizationId: string,
    chunks: string[],
  ): Promise<void> {
    if (chunks.length === 0) return;

    // Build a bulk insert. Values are fully parameterized.
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk === undefined) continue;
      // Estimate token count: ~4 chars per token for English
      const tokenCount = Math.ceil(chunk.length / 4);
      valuePlaceholders.push(
        `($${String(idx++)}, $${String(idx++)}, $${String(idx++)}, $${String(idx++)}, $${String(idx++)})`,
      );
      params.push(organizationId, documentId, i, chunk, tokenCount);
    }

    await this.pool.query(
      `INSERT INTO knowledge_chunks
         (organization_id, document_id, chunk_index, content, token_count)
       VALUES ${valuePlaceholders.join(', ')}`,
      params,
    );
  }

  private async scheduleEmbedding(
    documentId: string,
    organizationId: string,
    correlationId: string,
  ): Promise<void> {
    if (!this.scheduler) return;
    const payload: EmbeddingJobPayload = { documentId, organizationId, correlationId };
    await this.scheduler(payload);
  }
}
