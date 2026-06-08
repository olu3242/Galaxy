import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MetricsService } from '@galaxy/analytics';
import { KPIService } from '@galaxy/analytics';
import { DashboardService } from '@galaxy/analytics';
import { ReportingService } from '@galaxy/analytics';
import type { DashboardCategory, MetricPeriod } from '@galaxy/analytics';

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const metricsService = new MetricsService(fastify.pg);
  const kpiService = new KPIService(fastify.pg);
  const dashboardService = new DashboardService(fastify.pg);
  const reportingService = new ReportingService(fastify.pg);

  fastify.get(
    '/analytics/metrics',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          category?: string;
          period?: MetricPeriod;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, category, period, limit, offset } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const metrics = await metricsService.getMetrics(organizationId, {
        category,
        period,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });

      return reply.send(responseEnvelope(metrics, request.id));
    },
  );

  fastify.get(
    '/analytics/kpis',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const kpis = await kpiService.getKPIs(organizationId);
      return reply.send(responseEnvelope(kpis, request.id));
    },
  );

  fastify.get(
    '/analytics/dashboards/:category',
    async (
      request: FastifyRequest<{
        Params: { category: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      const category = request.params.category as DashboardCategory;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const validCategories: DashboardCategory[] = [
        'executive',
        'operations',
        'department',
        'workflow',
        'communication',
        'compliance',
        'platform',
      ];

      if (!validCategories.includes(category)) {
        return reply.status(400).send({ error: 'Invalid dashboard category' });
      }

      const dashboard = await dashboardService.getDashboard(organizationId, category);
      return reply.send(responseEnvelope(dashboard, request.id));
    },
  );

  fastify.post(
    '/analytics/reports',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          name: string;
          category: DashboardCategory;
          templateId?: string;
          generatedBy: string;
          data?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, name, category, templateId, generatedBy, data } = request.body;

      if (!organizationId || !name || !category || !generatedBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, name, category, generatedBy are required' });
      }

      const report = await reportingService.generateReport({
        organizationId,
        name,
        category,
        templateId,
        generatedBy,
        data,
      });

      return reply.status(201).send(responseEnvelope(report, request.id));
    },
  );
}
