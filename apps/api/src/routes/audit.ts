import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { newCorrelationId } from '@galaxy/utils';
import { AuditSearchService } from '@galaxy/identity';
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

export function auditRoutes(fastify: FastifyInstance): void {
  const searchService = new AuditSearchService(fastify.pg);

  // GET /audit/logs — basic PostgreSQL list with filters (retained for backward compat)
  fastify.get(
    '/audit/logs',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          limit?: string;
          offset?: string;
          actorType?: string;
          action?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId, limit, offset, actorType, action } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);
      await fastify.pg.query('SELECT set_config($1, $2, true)', ['app.current_role', 'auditor']);

      const queryLimit = limit ? parseInt(limit, 10) : 50;
      const queryOffset = offset ? parseInt(offset, 10) : 0;

      const conditions: string[] = ['organization_id = $1'];
      const params: unknown[] = [organizationId];
      let paramIdx = 2;

      if (actorType) {
        conditions.push(`actor_type = $${String(paramIdx)}`);
        params.push(actorType);
        paramIdx++;
      }

      if (action) {
        conditions.push(`action = $${String(paramIdx)}`);
        params.push(action);
        paramIdx++;
      }

      params.push(queryLimit, queryOffset);

      const result = await fastify.pg.query(
        `SELECT * FROM audit_logs WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${String(paramIdx)} OFFSET $${String(paramIdx + 1)}`,
        params,
      );

      return reply.send(responseEnvelope(result.rows, correlationId));
    },
  );

  // GET /audit/search — full-text search via Elasticsearch (falls back to PostgreSQL ILIKE)
  fastify.get(
    '/audit/search',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          q?: string;
          actorType?: string;
          action?: string;
          resourceType?: string;
          from?: string;
          to?: string;
          size?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, q, actorType, action, resourceType, from, to, size, offset } =
        request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const result = await searchService.search({
        organizationId,
        ...(q !== undefined ? { q } : {}),
        ...(actorType !== undefined ? { actorType } : {}),
        ...(action !== undefined ? { action } : {}),
        ...(resourceType !== undefined ? { resourceType } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(size !== undefined ? { size: parseInt(size, 10) } : {}),
        ...(offset !== undefined ? { from_offset: parseInt(offset, 10) } : {}),
      });

      return reply.send(
        responseEnvelope(
          { hits: result.hits, total: result.total, source: result.source },
          request.id,
        ),
      );
    },
  );

  // POST /audit/sync — enqueue backfill of existing audit logs to Elasticsearch
  fastify.post(
    '/audit/sync',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; batchSize?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, batchSize = 100 } = request.body;
      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const result = await fastify.pg.query<{
        id: number;
        organization_id: string;
        actor_type: string;
        actor_id: string | null;
        action: string;
        resource_type: string | null;
        resource_id: string | null;
        ip_address: string | null;
        correlation_id: string;
        causation_id: string | null;
        created_at: string;
      }>(
        `SELECT id, organization_id, actor_type, actor_id, action, resource_type, resource_id,
                ip_address, correlation_id, causation_id, created_at
         FROM audit_logs WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [organizationId, batchSize],
      );

      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });
      const queue = new Queue('audit-sync', { connection: redis });

      try {
        const jobs = result.rows.map((row) => ({
          name: 'sync',
          data: {
            doc: {
              id: row.id,
              organizationId: row.organization_id,
              actorType: row.actor_type,
              actorId: row.actor_id,
              action: row.action,
              resourceType: row.resource_type,
              resourceId: row.resource_id,
              ipAddress: row.ip_address,
              correlationId: row.correlation_id,
              causationId: row.causation_id,
              createdAt: row.created_at,
            },
          },
        }));

        await queue.addBulk(jobs);

        return await reply
          .status(202)
          .send(responseEnvelope({ queued: jobs.length, organizationId }, request.id));
      } finally {
        await queue.close();
        await redis.quit();
      }
    },
  );
}
