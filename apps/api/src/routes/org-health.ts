import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HealthScoringService, HealthMonitorService } from '@galaxy/org-health';
import type { HealthDimension } from '@galaxy/org-health';

export async function orgHealthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/org-health/scores', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new HealthScoringService(fastify.pg);
    return reply.send(await svc.getAllLatestScores(orgId));
  });

  fastify.post(
    '/org-health/scores',
    async (
      request: FastifyRequest<{
        Body: {
          dimension: HealthDimension;
          score: number;
          indicators?: Record<string, unknown>;
          recommendations?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { dimension, score, indicators, recommendations } = request.body;
      const svc = new HealthScoringService(fastify.pg);
      const result = await svc.recordScore(
        orgId,
        dimension,
        score,
        indicators ?? {},
        recommendations ?? [],
      );
      return reply.status(201).send(result);
    },
  );

  fastify.get(
    '/org-health/scores/:dimension/trend',
    async (
      request: FastifyRequest<{
        Params: { dimension: HealthDimension };
        Querystring: { days?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { dimension } = request.params;
      const { days } = request.query;
      const svc = new HealthScoringService(fastify.pg);
      return reply.send(
        await svc.getTrend(orgId, dimension, days !== undefined ? parseInt(days, 10) : undefined),
      );
    },
  );

  fastify.get('/org-health/overall', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new HealthMonitorService(fastify.pg);
    return reply.send(await svc.computeOverallHealth(orgId));
  });

  fastify.get('/org-health/at-risk', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new HealthMonitorService(fastify.pg);
    return reply.send(await svc.flagAtRisk(orgId));
  });
}
