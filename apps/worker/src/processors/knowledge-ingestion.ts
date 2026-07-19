import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

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

interface VoyageEmbeddingResponse {
  data: { embedding: number[] }[];
  usage: { total_tokens: number };
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
// voyage-3-lite produces 512-dim vectors; voyage-3 produces 1024-dim.
// knowledge_chunks.embedding is sized at 1024 in migration 072.
const VOYAGE_MODEL = 'voyage-3';
const EMBEDDING_DIMENSIONS = 1024;
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

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

async function embedText(
  text: string,
  apiKey: string,
): Promise<{ embedding: number[]; tokens: number }> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: 'document' }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage API error ${String(response.status)}: ${body}`);
  }

  const data = (await response.json()) as VoyageEmbeddingResponse;
  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    throw new Error('Voyage API returned empty embedding');
  }
  return { embedding, tokens: data.usage.total_tokens };
}

function mockEmbedding(chunkIndex: number, tokenHint: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, k) =>
    Math.sin((k + 1) * (tokenHint + chunkIndex + 1) * 0.001),
  );
}

export function createKnowledgeIngestionProcessor(
  pool: Pool,
  voyageApiKey: string | undefined,
): (job: Job) => Promise<void> {
  const useRealEmbeddings = Boolean(voyageApiKey);

  if (!useRealEmbeddings) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'knowledge.ingestion.mock_embeddings',
        reason: 'VOYAGE_API_KEY not set — using deterministic mock embeddings',
      }),
    );
  }

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
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

      let totalTokens = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        let embedding: number[];
        let tokenCount: number;

        if (useRealEmbeddings && voyageApiKey) {
          const result = await embedText(chunk, voyageApiKey);
          embedding = result.embedding;
          tokenCount = result.tokens;
        } else {
          // Deterministic mock: stable across re-ingestions of the same document
          embedding = mockEmbedding(i, chunk.length);
          tokenCount = Math.ceil(chunk.length / 4);
        }

        totalTokens += tokenCount;

        await pool.query(
          `INSERT INTO knowledge_chunks (organization_id, document_id, chunk_index, content, embedding, token_count)
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [organizationId, documentId, i, chunk, `[${embedding.join(',')}]`, tokenCount],
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
          totalTokens,
          embeddingSource: useRealEmbeddings ? 'voyage-ai' : 'mock',
        }),
      );
    });
}
