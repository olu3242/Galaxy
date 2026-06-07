import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { newCorrelationId } from '@galaxy/utils';

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /audit/logs — auditor-only
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

      // Set tenant context and auditor role
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
        conditions.push(`actor_type = $${paramIdx}`);
        params.push(actorType);
        paramIdx++;
      }

      if (action) {
        conditions.push(`action = $${paramIdx}`);
        params.push(action);
        paramIdx++;
      }

      params.push(queryLimit, queryOffset);

      const result = await fastify.pg.query(
        `SELECT * FROM audit_logs WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        params,
      );

      return reply.send(responseEnvelope(result.rows, correlationId));
    },
  );
}
