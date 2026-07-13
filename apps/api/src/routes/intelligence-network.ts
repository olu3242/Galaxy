import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ContributionService,
  BenchmarkService,
  PeerMatchingService,
} from '@galaxy/intelligence-network';

export async function intelligenceNetworkRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/intelligence/opt-in',
    async (
      request: FastifyRequest<{
        Body: { orgId: string; metricKey: string; metricValue: number; period: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, metricKey, metricValue, period } = request.body;
      const service = new ContributionService(fastify.pg);
      const contribution = await service.contribute({
        organizationId: orgId,
        metricKey,
        metricValue,
        period,
      });
      return reply.status(201).send({ contribution });
    },
  );

  fastify.post(
    '/intelligence/opt-out',
    async (
      request: FastifyRequest<{
        Body: { orgId: string; metricKey: string; period: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, metricKey, period } = request.body;
      const service = new ContributionService(fastify.pg);
      await service.withdraw(orgId, metricKey, period);
      return reply.status(204).send();
    },
  );

  fastify.get(
    '/intelligence/benchmarks',
    async (
      request: FastifyRequest<{
        Querystring: { industry: string; sizeBucket: string; period?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { industry, sizeBucket, period } = request.query;
      const service = new BenchmarkService(fastify.pg);
      const benchmarks = await service.getBenchmarks(industry, sizeBucket, period);
      return reply.send({ benchmarks });
    },
  );

  fastify.get(
    '/intelligence/peer-comparison',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; industry: string; sizeBucket: string; period: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, industry, sizeBucket, period } = request.query;
      const service = new PeerMatchingService(fastify.pg);
      const comparison = await service.getPeerComparison(orgId, industry, sizeBucket, period);
      return reply.send({ comparison });
    },
  );

  fastify.get(
    '/intelligence/recommendations',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; industry: string; sizeBucket: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, industry, sizeBucket } = request.query;
      const service = new PeerMatchingService(fastify.pg);
      const recommendations = await service.getRecommendations(orgId, industry, sizeBucket);
      return reply.send({ recommendations });
    },
  );
}
