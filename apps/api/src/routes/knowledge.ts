import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { KnowledgeService, KnowledgeSearchService } from '@galaxy/knowledge';
import type { DocumentStatus } from '@galaxy/knowledge';

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
        status,
        categoryId,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
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
        categoryId,
        limit: limit ? parseInt(limit, 10) : undefined,
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
}
