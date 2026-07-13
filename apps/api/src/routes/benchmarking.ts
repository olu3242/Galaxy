import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IndustryBenchmarkService, PeerComparisonService } from '@galaxy/benchmarking';

export async function benchmarkingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/benchmarks/percentile',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; industry: string; sizeBucket: string; period?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, industry, sizeBucket, period } = request.query;
      const service = new IndustryBenchmarkService(fastify.pg);
      const percentiles = await service.getOrgPercentile(orgId, industry, sizeBucket, period);
      return reply.send({ percentiles });
    },
  );

  fastify.get(
    '/benchmarks/report',
    async (
      request: FastifyRequest<{
        Querystring: { industry: string; sizeBucket: string; period?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { industry, sizeBucket, period } = request.query;
      const service = new IndustryBenchmarkService(fastify.pg);
      const report = await service.getIndustryReport(industry, sizeBucket, period);
      return reply.send({ report });
    },
  );

  fastify.get(
    '/benchmarks/comparison',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; industry: string; sizeBucket: string; period?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, industry, sizeBucket, period } = request.query;
      const service = new PeerComparisonService(fastify.pg);
      const report = await service.generateComparisonReport(orgId, industry, sizeBucket, period);
      return reply.send({ report });
    },
  );
}
