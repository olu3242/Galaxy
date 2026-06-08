import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrgMemoryService } from '@galaxy/org-memory';
import type { MemoryType, StoreMemoryInput, RecallQuery } from '@galaxy/org-memory';

export function orgMemoryRoutes(fastify: FastifyInstance): void {
  fastify.post(
    '/memory',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          memoryType: string;
          subject: string;
          content: string;
          source: string;
          confidence?: number;
          relevanceTags?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, memoryType, subject, content, source, confidence, relevanceTags } =
        request.body;
      const service = new OrgMemoryService(fastify.pg);
      const input: StoreMemoryInput = {
        memoryType: memoryType as MemoryType,
        subject,
        content,
        source,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(relevanceTags !== undefined ? { relevanceTags } : {}),
      };
      const memory = await service.store(orgId, input);
      return reply.status(201).send({ memory });
    },
  );

  fastify.get(
    '/memory',
    async (
      request: FastifyRequest<{
        Querystring: {
          orgId: string;
          type?: string;
          tags?: string;
          limit?: string;
          onlyValid?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, type, tags, limit, onlyValid } = request.query;
      const service = new OrgMemoryService(fastify.pg);
      const query: RecallQuery = {
        ...(type ? { type: type as MemoryType } : {}),
        ...(tags ? { tags: tags.split(',') } : {}),
        ...(limit ? { limit: parseInt(limit, 10) } : {}),
        ...(onlyValid !== undefined ? { onlyValid: onlyValid === 'true' } : {}),
      };
      const memories = await service.recall(orgId, query);
      return reply.send({ memories });
    },
  );

  fastify.delete(
    '/memory/:memoryId',
    async (
      request: FastifyRequest<{ Params: { memoryId: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { memoryId } = request.params;
      const { orgId } = request.query;
      const service = new OrgMemoryService(fastify.pg);
      await service.invalidate(orgId, memoryId);
      return reply.status(204).send();
    },
  );

  fastify.get(
    '/memory/stats',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new OrgMemoryService(fastify.pg);
      const stats = await service.getMemoryStats(orgId);
      return reply.send({ stats });
    },
  );
}
