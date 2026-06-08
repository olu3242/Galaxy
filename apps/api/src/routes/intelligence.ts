import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  HealthScoreService,
  InsightService,
  RecommendationService,
  RiskDetectionService,
} from '@galaxy/intelligence';
import type { InsightType, RiskLevel } from '@galaxy/intelligence';

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function intelligenceRoutes(fastify: FastifyInstance): void {
  const healthScoreService = new HealthScoreService(fastify.pg);
  const insightService = new InsightService(fastify.pg);
  const recommendationService = new RecommendationService(fastify.pg);
  const riskDetectionService = new RiskDetectionService(fastify.pg);

  fastify.get(
    '/intelligence/health',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; category?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, category } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      let score;
      if (category === 'workflow') {
        score = await healthScoreService.computeWorkflowEffectiveness(organizationId);
      } else if (category === 'communication') {
        score = await healthScoreService.computeCommunicationEffectiveness(organizationId);
      } else if (category === 'engagement') {
        score = await healthScoreService.computeMemberEngagement(organizationId);
      } else {
        score = await healthScoreService.computeOrganizationHealth(organizationId);
      }

      return reply.send(responseEnvelope(score, request.id));
    },
  );

  fastify.get(
    '/intelligence/insights',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; type?: InsightType; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, type, limit } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const insights = await insightService.listInsights(
        organizationId,
        type,
        limit ? parseInt(limit, 10) : undefined,
      );

      return reply.send(responseEnvelope(insights, request.id));
    },
  );

  fastify.get(
    '/intelligence/recommendations',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const recommendations = await recommendationService.prioritizeRecommendations(organizationId);
      return reply.send(responseEnvelope(recommendations, request.id));
    },
  );

  fastify.get(
    '/intelligence/risks',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; level?: RiskLevel };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, level } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const risks = await riskDetectionService.listRisks(organizationId, level);
      return reply.send(responseEnvelope(risks, request.id));
    },
  );
}
