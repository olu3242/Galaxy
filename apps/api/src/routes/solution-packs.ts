import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SolutionPackService, SolutionPackTemplateService } from '@galaxy/solution-packs';
import type { Industry } from '@galaxy/solution-packs';

export function solutionPackRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/solution-packs',
    async (
      request: FastifyRequest<{ Querystring: { industry?: string } }>,
      reply: FastifyReply,
    ) => {
      const { industry } = request.query;
      const service = new SolutionPackService(fastify.pg);
      const packs = await service.listAvailablePacks(
        industry ? { industry: industry as Industry } : undefined,
      );
      return reply.send({ packs });
    },
  );

  fastify.get(
    '/solution-packs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const service = new SolutionPackService(fastify.pg);
      const pack = await service.getPack(id);
      if (!pack) return reply.status(404).send({ error: 'Solution pack not found' });
      return reply.send({ pack });
    },
  );

  fastify.post(
    '/solution-packs/:id/install',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.body;
      const service = new SolutionPackService(fastify.pg);
      const installation = await service.installPack(orgId, id, 'system');
      return reply.status(201).send({ installation });
    },
  );

  fastify.get(
    '/workflow-templates',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new SolutionPackTemplateService(fastify.pg);
      const templates = await service.listTemplates(orgId);
      return reply.send({ templates });
    },
  );
}
