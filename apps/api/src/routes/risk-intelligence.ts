import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RiskIntelligenceService, RiskAlertService } from '@galaxy/risk-intelligence';
import type { RiskDomain } from '@galaxy/risk-intelligence';

export function riskIntelligenceRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/risk/profile',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const riskService = new RiskIntelligenceService(fastify.pg);
      const alertService = new RiskAlertService(fastify.pg);
      const profile = await riskService.computeOrgRiskProfile(orgId);
      await alertService.processRiskAlerts(
        profile.domainScores
          .filter((d) => d.score > 60)
          .map((d) => ({
            organizationId: orgId,
            domain: d.domain,
            severity: d.level,
            title: `${d.domain} risk elevated`,
            description: `${d.domain} risk score is ${String(d.score)}`,
            score: d.score,
          })),
      );
      return reply.send({ profile });
    },
  );

  fastify.get(
    '/risk/alerts',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; includeResolved?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, includeResolved } = request.query;
      const service = new RiskAlertService(fastify.pg);
      const alerts = await service.listAlerts(orgId, includeResolved === 'true');
      return reply.send({ alerts });
    },
  );

  fastify.put(
    '/risk/alerts/:id/resolve',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { orgId } = request.query;
      const service = new RiskAlertService(fastify.pg);
      const alert = await service.resolveAlert(orgId, id);
      return reply.send({ alert });
    },
  );

  fastify.get(
    '/risk/trend/:domain',
    async (
      request: FastifyRequest<{ Params: { domain: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { domain } = request.params;
      const { orgId } = request.query;
      const service = new RiskIntelligenceService(fastify.pg);
      const trend = await service.getRiskTrend(orgId, domain as RiskDomain);
      return reply.send({ trend });
    },
  );
}
