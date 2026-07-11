import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import type { Job } from 'bullmq';

interface KnowledgeIngestionJobData {
  organizationId: string;
  documentId: string;
}

interface DocumentRow {
  id: string;
  organization_id: string;
  content: string;
  title: string;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

export function createKnowledgeIngestionProcessor(
  pool: Pool,
  anthropicApiKey: string,
): (job: Job) => Promise<void> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  return async (job: Job): Promise<void> => {
    const { organizationId, documentId } = job.data as KnowledgeIngestionJobData;

    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

    const docResult = await pool.query<DocumentRow>(
      'SELECT id, organization_id, content, title FROM knowledge_documents WHERE id = $1 AND organization_id = $2',
      [documentId, organizationId],
    );

    const doc = docResult.rows[0];
    if (!doc) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'knowledge.ingestion.document_not_found',
          documentId,
          organizationId,
        }),
      );
      return;
    }

    const fullText = `${doc.title}\n\n${doc.content}`;
    const chunks = chunkText(fullText);

    await pool.query(
      'DELETE FROM knowledge_chunks WHERE document_id = $1 AND organization_id = $2',
      [documentId, organizationId],
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      const embeddingResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [
          {
            role: 'user',
            content: `Summarize in one word: ${chunk.slice(0, 50)}`,
          },
        ],
      });

      // Use a deterministic mock embedding derived from Anthropic input_tokens as a placeholder;
      // production would use a dedicated embeddings API (e.g. text-embedding-3-small).
      const tokenCount = embeddingResponse.usage.input_tokens;
      const mockEmbedding = Array.from({ length: 1536 }, (_, k) =>
        Math.sin((k + 1) * (tokenCount + i + 1) * 0.001),
      );

      await pool.query(
        `INSERT INTO knowledge_chunks (organization_id, document_id, chunk_index, content, embedding, token_count)
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
        [organizationId, documentId, i, chunk, `[${mockEmbedding.join(',')}]`, tokenCount],
      );
    }

    await pool.query(
      `UPDATE knowledge_documents
       SET ingested_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId],
    );

    console.warn(
      JSON.stringify({
        level: 'info',
        event: 'knowledge.ingested',
        documentId,
        organizationId,
        chunkCount: chunks.length,
      }),
    );
  };
}
