import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BroadcastService } from '@galaxy/communication';
import { EventPublisher } from '@galaxy/events';
import { AuditService } from '@galaxy/identity';
import { AuditRepository } from '@galaxy/identity';
import { randomUUID } from 'crypto';

function envelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export function broadcastRoutes(fastify: FastifyInstance): void {
  const eventPublisher = new EventPublisher(fastify.pg);
  const auditRepo = new AuditRepository(fastify.pg);
  const auditService = new AuditService(auditRepo);
  const broadcastService = new BroadcastService(fastify.pg, eventPublisher, auditService);

  fastify.post(
    '/broadcasts',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          title: string;
          content: string;
          targetType?: string;
          targetIds?: string[];
          sentBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, title, content, targetType, targetIds, sentBy } = request.body;
      if (!organizationId || !title || !content || !sentBy) {
        return reply.status(400).send({ error: 'organizationId, title, content, sentBy required' });
      }
      const broadcast = await broadcastService.create({
        organizationId,
        title,
        content,
        sentBy,
        correlationId: randomUUID(),
        ...(targetType !== undefined ? { targetType } : {}),
        ...(targetIds !== undefined ? { targetIds } : {}),
      });
      return reply.status(201).send(envelope(broadcast, request.id));
    },
  );

  fastify.get(
    '/broadcasts',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, limit, offset } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const broadcasts = await broadcastService.list(
        organizationId,
        limit ? parseInt(limit, 10) : undefined,
        offset ? parseInt(offset, 10) : undefined,
      );
      return reply.send(envelope(broadcasts, request.id));
    },
  );

  fastify.get(
    '/broadcasts/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const broadcast = await broadcastService.getById(organizationId, id);
      if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' });
      return reply.send(envelope(broadcast, request.id));
    },
  );

  fastify.post(
    '/broadcasts/:id/send',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string; actorId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId, actorId } = request.body;
      if (!organizationId || !actorId) {
        return reply.status(400).send({ error: 'organizationId and actorId required' });
      }
      const broadcast = await broadcastService.send(organizationId, id, actorId, randomUUID());
      return reply.send(envelope(broadcast, request.id));
    },
  );
}
