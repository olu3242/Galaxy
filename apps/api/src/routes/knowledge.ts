import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  KnowledgeService,
  KnowledgeSearchService,
  KnowledgeIngestionService,
  SemanticSearchService,
} from '@galaxy/knowledge';
import type { DocumentStatus, IngestionSourceType } from '@galaxy/knowledge';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function knowledgeRoutes(fastify: FastifyInstance): Promise<void> {
  const knowledgeService = new KnowledgeService(fastify.pg);
  const searchService = new KnowledgeSearchService(fastify.pg);
  // Wire BullMQ scheduler into KnowledgeIngestionService
  const embeddingScheduler = async (payload: {
    documentId: string;
    organizationId: string;
    correlationId: string;
  }): Promise<void> => {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue('knowledge-embedding', { connection: redis });
    try {
      await queue.add('generate-embeddings', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });
    } finally {
      await queue.close();
      await redis.quit();
    }
  };

  const ingestionService = new KnowledgeIngestionService(fastify.pg, embeddingScheduler);
  const semanticSearchService = new SemanticSearchService(fastify.pg);

  fastify.post(
    '/knowledge/documents',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          categoryId?: string;
          title: string;
          content: string;
          authorId: string;
          tags?: string[];
          metadata?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, categoryId, title, content, authorId, tags, metadata } = request.body;

      if (!organizationId || !title || !content || !authorId) {
        return reply
          .status(400)
          .send({ error: 'organizationId, title, content, authorId are required' });
      }

      const doc = await knowledgeService.createDocument({
        organizationId,
        categoryId,
        title,
        content,
        authorId,
        tags,
        metadata,
      });

      return reply.status(201).send(responseEnvelope(doc, request.id));
    },
  );

  fastify.get(
    '/knowledge/documents',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          status?: DocumentStatus;
          categoryId?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, status, categoryId, limit, offset } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const docs = await knowledgeService.listDocuments(organizationId, {
        ...(status !== undefined ? { status } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(limit ? { limit: parseInt(limit, 10) } : {}),
        ...(offset ? { offset: parseInt(offset, 10) } : {}),
      });

      return reply.send(responseEnvelope(docs, request.id));
    },
  );

  fastify.get(
    '/knowledge/documents/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      const { id } = request.params;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const doc = await knowledgeService.getDocument(organizationId, id);
      if (!doc) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      return reply.send(responseEnvelope(doc, request.id));
    },
  );

  fastify.patch(
    '/knowledge/documents/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          organizationId: string;
          title?: string;
          content?: string;
          categoryId?: string;
          tags?: string[];
          metadata?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, ...rest } = request.body;
      const { id } = request.params;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const doc = await knowledgeService.updateDocument({
        organizationId,
        documentId: id,
        ...rest,
      });

      return reply.send(responseEnvelope(doc, request.id));
    },
  );

  fastify.post(
    '/knowledge/documents/:id/publish',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.body;
      const { id } = request.params;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const doc = await knowledgeService.publishDocument(organizationId, id);
      return reply.send(responseEnvelope(doc, request.id));
    },
  );

  fastify.get(
    '/knowledge/search',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          q: string;
          categoryId?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, q, categoryId, limit } = request.query;

      if (!organizationId || !q) {
        return reply.status(400).send({ error: 'organizationId and q are required' });
      }

      const results = await searchService.search(organizationId, q, {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(limit ? { limit: parseInt(limit, 10) } : {}),
      });

      return reply.send(responseEnvelope(results, request.id));
    },
  );

  fastify.get(
    '/knowledge/categories',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const result = await fastify.pg.query(
        'SELECT * FROM knowledge_categories WHERE organization_id = $1 ORDER BY name ASC',
        [organizationId],
      );

      return reply.send(responseEnvelope(result.rows, request.id));
    },
  );

  // ── Document ingestion (enqueue RAG embedding job) ──────────────────────────

  fastify.post(
    '/knowledge/documents/:id/ingest',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });
      const ingestionQueue = new Queue('knowledge-ingestion', { connection: redis });

      try {
        await ingestionQueue.add('ingest-document', { organizationId, documentId: id });
        return await reply
          .status(202)
          .send(responseEnvelope({ queued: true, documentId: id }, request.id));
      } finally {
        await ingestionQueue.close();
        await redis.quit();
      }
    },
  );

  // ── RAG semantic search ─────────────────────────────────────────────────────

  fastify.get(
    '/knowledge/rag',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; query: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, query, limit } = request.query;
      if (!organizationId || !query) {
        return reply.status(400).send({ error: 'organizationId and query required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const topK = limit ? parseInt(limit, 10) : 5;

      const voyageApiKey = process.env.VOYAGE_API_KEY;
      let chunks: {
        document_id: string;
        chunk_index: number;
        content: string;
        token_count: number | null;
        score: number;
      }[];
      let searchMethod: 'vector' | 'fulltext';

      if (voyageApiKey) {
        // Real pgvector cosine-similarity search
        const embRes = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${voyageApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: 'voyage-3', input: [query], input_type: 'query' }),
        });

        if (!embRes.ok) {
          return reply.status(502).send({ error: 'Embedding service unavailable' });
        }

        const embData = (await embRes.json()) as {
          data: { embedding: number[] }[];
        };
        const queryVector = embData.data[0]?.embedding ?? [];

        const vectorResult = await fastify.pg.query<{
          document_id: string;
          chunk_index: number;
          content: string;
          token_count: number | null;
          score: number;
        }>(
          `SELECT
             kc.document_id,
             kc.chunk_index,
             kc.content,
             kc.token_count,
             1 - (kc.embedding <=> $2::vector) AS score
           FROM knowledge_chunks kc
           WHERE kc.organization_id = $1
           ORDER BY kc.embedding <=> $2::vector
           LIMIT $3`,
          [organizationId, `[${queryVector.join(',')}]`, topK],
        );

        chunks = vectorResult.rows;
        searchMethod = 'vector';
      } else {
        // Fallback: full-text search when embeddings are not configured
        const ftResult = await fastify.pg.query<{
          document_id: string;
          chunk_index: number;
          content: string;
          token_count: number | null;
          score: number;
        }>(
          `SELECT
             kc.document_id,
             kc.chunk_index,
             kc.content,
             kc.token_count,
             ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', $2)) AS score
           FROM knowledge_chunks kc
           WHERE kc.organization_id = $1
             AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', $2)
           ORDER BY score DESC
           LIMIT $3`,
          [organizationId, query, topK],
        );

        chunks = ftResult.rows;
        searchMethod = 'fulltext';
      }

      return reply.send(
        responseEnvelope(
          {
            query,
            chunks,
            count: chunks.length,
            searchMethod,
          },
          request.id,
        ),
      );
    },
  );

  // ── KnowledgeIngestionService: POST /knowledge/ingest ─────────────────────

  fastify.post(
    '/knowledge/ingest',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          title: string;
          content: string;
          sourceType: IngestionSourceType;
          sourceId: string;
          tags?: string[];
          createdBy: string;
          correlationId: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        organizationId,
        title,
        content,
        sourceType,
        sourceId,
        tags = [],
        createdBy,
        correlationId,
      } = request.body;

      if (!organizationId || !title || !content || !sourceId || !createdBy) {
        return reply
          .status(400)
          .send({
            error: 'organizationId, title, content, sourceType, sourceId, createdBy are required',
          });
      }

      const document = await ingestionService.ingestText({
        organizationId,
        title,
        content,
        sourceType,
        sourceId,
        tags,
        createdBy,
        correlationId: correlationId,
      });

      return reply.status(201).send(responseEnvelope(document, request.id));
    },
  );

  // ── SemanticSearchService: GET /knowledge/semantic-search ────────────────

  fastify.get(
    '/knowledge/semantic-search',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          q: string;
          sourceTypes?: string;
          tags?: string;
          limit?: string;
          minRelevance?: string;
          mode?: 'keyword' | 'fulltext';
        };
      }>,
      reply: FastifyReply,
    ) => {
      const {
        organizationId,
        q,
        sourceTypes,
        tags,
        limit,
        minRelevance,
        mode = 'fulltext',
      } = request.query;

      if (!organizationId || !q) {
        return reply.status(400).send({ error: 'organizationId and q are required' });
      }

      const parsedTags = tags ? tags.split(',').map((t) => t.trim()) : undefined;
      const parsedSourceTypes = sourceTypes
        ? sourceTypes.split(',').map((s) => s.trim())
        : undefined;

      let results;
      if (mode === 'keyword') {
        results = await semanticSearchService.search(organizationId, q, {
          ...(parsedTags !== undefined ? { tags: parsedTags } : {}),
          ...(parsedSourceTypes !== undefined ? { sourceTypes: parsedSourceTypes } : {}),
          ...(limit ? { limit: parseInt(limit, 10) } : {}),
          ...(minRelevance ? { minRelevance: parseFloat(minRelevance) } : {}),
        });
      } else {
        results = await semanticSearchService.fullTextSearch(
          organizationId,
          q,
          limit ? parseInt(limit, 10) : undefined,
        );
      }

      return reply.send(responseEnvelope({ results, count: results.length, mode }, request.id));
    },
  );
}
