import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  WorkloadForecastService,
  SLABreachPredictorService,
  ChurnRiskService,
} from '@galaxy/predictive';

export function predictiveRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/predictive/sla-breaches',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new SLABreachPredictorService(fastify.pg);
      const breaches = await service.computeBreachProbability(orgId);
      return reply.send({ breaches });
    },
  );

  fastify.get(
    '/predictive/workload-forecast',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; domain?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, domain } = request.query;
      const service = new WorkloadForecastService(fastify.pg);
      const forecast = await service.forecast(orgId, domain ?? 'all');
      return reply.send({ forecast });
    },
  );

  fastify.get(
    '/predictive/churn-risk',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new ChurnRiskService(fastify.pg);
      const scores = await service.computeChurnRisk(orgId);
      return reply.send({ scores });
    },
  );
}
