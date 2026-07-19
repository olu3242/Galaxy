import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DigitalCOOService } from '@galaxy/coo';

export async function cooRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/coo/briefing',
    async (
      request: FastifyRequest<{ Body: { orgId: string; correlationId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, correlationId } = request.body;
      const service = new DigitalCOOService(fastify.pg);
      const briefing = await service.generateBriefing(
        orgId,
        'system',
        correlationId ?? crypto.randomUUID(),
      );
      return reply.status(201).send({ briefing });
    },
  );

  fastify.get(
    '/coo/briefings',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, limit } = request.query;
      const service = new DigitalCOOService(fastify.pg);
      const briefings = await service.getBriefingHistory(orgId, limit ? parseInt(limit, 10) : 10);
      return reply.send({ briefings });
    },
  );

  fastify.get(
    '/coo/briefings/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.query;
      const service = new DigitalCOOService(fastify.pg);
      const briefing = await service.getBriefing(orgId, id);
      if (!briefing) return reply.status(404).send({ error: 'Briefing not found' });
      return reply.send({ briefing });
    },
  );

  fastify.get(
    '/coo/actions',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; status?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, status } = request.query;
      const service = new DigitalCOOService(fastify.pg);
      const actions = await service.listActions(orgId, status);
      return reply.send({ actions });
    },
  );

  fastify.post(
    '/coo/actions/:id/approve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { orgId: string; approvedBy: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId, approvedBy } = request.body;
      const service = new DigitalCOOService(fastify.pg);
      const action = await service.approveAction(orgId, id, approvedBy);
      return reply.send({ action });
    },
  );

  fastify.post(
    '/coo/actions/:id/reject',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { orgId: string; rejectedBy: string; reason: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId, rejectedBy, reason } = request.body;
      const service = new DigitalCOOService(fastify.pg);
      const action = await service.rejectAction(orgId, id, rejectedBy, reason);
      return reply.send({ action });
    },
  );
}
