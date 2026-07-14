import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BroadcastService } from '@galaxy/communication';
import { EventPublisher } from '@galaxy/events';
import { AuditService } from '@galaxy/identity';
import { AuditRepository } from '@galaxy/identity';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

function envelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

// WABA tier limits (messages/second): free tier = 1, business = 20
const WABA_TIER_LIMIT = parseInt(process.env.WABA_RATE_LIMIT ?? '20', 10);

export async function broadcastRoutes(fastify: FastifyInstance): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const notificationQueue = new Queue('notification-dispatch', { connection: redis });

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
      const correlationId = randomUUID();
      const broadcast = await broadcastService.send(organizationId, id, actorId, correlationId);

      // Fan-out: enqueue one notification job per whatsapp member, rate-limited by tier
      const membersResult = await fastify.pg.query<{ whatsapp_phone: string; user_id: string }>(
        `SELECT u.whatsapp_phone, m.user_id
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1
           AND m.status = 'active'
           AND u.whatsapp_phone IS NOT NULL`,
        [organizationId],
      );

      const jobs = membersResult.rows.map((row, idx) => ({
        name: 'send-broadcast-message',
        data: {
          organizationId,
          broadcastId: id,
          recipientPhone: row.whatsapp_phone,
          recipientId: row.user_id,
          content: broadcast.content,
          correlationId,
        },
        opts: {
          // Stagger jobs to respect WABA rate limit
          delay: Math.floor(idx / WABA_TIER_LIMIT) * 1000,
        },
      }));

      if (jobs.length > 0) {
        await notificationQueue.addBulk(jobs);
      }

      return reply.send(envelope(broadcast, request.id));
    },
  );

  fastify.addHook('onClose', async () => {
    await notificationQueue.close();
    await redis.quit();
  });
}
