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
        ...(category !== undefined ? { category } : {}),
        ...(period !== undefined ? { period } : {}),
        ...(limit ? { limit: parseInt(limit, 10) } : {}),
        ...(offset ? { offset: parseInt(offset, 10) } : {}),
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
      const { organizationId, name } = request.body;

      if (!organizationId || !name || !request.body.generatedBy) {
        return reply
          .status(400)
          .send({ error: 'organizationId, name, category, generatedBy are required' });
      }

      const report = await reportingService.generateReport({
        organizationId,
        name,
        category: request.body.category,
        generatedBy: request.body.generatedBy,
        ...(request.body.templateId !== undefined ? { templateId: request.body.templateId } : {}),
        ...(request.body.data !== undefined ? { data: request.body.data } : {}),
      });

      return reply.status(201).send(responseEnvelope(report, request.id));
    },
  );

  fastify.get(
    '/analytics/org-health',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      const [workflowResult, loopResult] = await Promise.all([
        fastify.pg.query<{
          active_workflows: string;
          completed_today: string;
          pending_approval: string;
          sla_breaches: string;
        }>(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'active') AS active_workflows,
            COUNT(*) FILTER (WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '24 hours') AS completed_today,
            COUNT(*) FILTER (WHERE status IN ('pending_approval','pending_finance_review')) AS pending_approval,
            COUNT(*) FILTER (WHERE sla_deadline < NOW() AND status NOT IN ('completed','rejected')) AS sla_breaches
          FROM workflow_instances
          WHERE organization_id = $1`,
          [organizationId],
        ),
        fastify.pg.query<{ completed: string; total: string }>(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) AS total
          FROM loop_instances
          WHERE organization_id = $1`,
          [organizationId],
        ),
      ]);

      const wf = workflowResult.rows[0] ?? {
        active_workflows: '0',
        completed_today: '0',
        pending_approval: '0',
        sla_breaches: '0',
      };
      const lp = loopResult.rows[0] ?? { completed: '0', total: '0' };

      const totalLoops = parseInt(lp.total, 10);
      const loopCompletionRate =
        totalLoops > 0 ? (parseInt(lp.completed, 10) / totalLoops) * 100 : 100;
      const slaBreaches = parseInt(wf.sla_breaches, 10);
      const activeWorkflows = parseInt(wf.active_workflows, 10);
      const slaCompliance =
        activeWorkflows > 0
          ? Math.max(0, ((activeWorkflows - slaBreaches) / activeWorkflows) * 100)
          : 100;
      const overall = Math.round(loopCompletionRate * 0.4 + slaCompliance * 0.6);

      return reply.send(
        responseEnvelope(
          {
            overall,
            workflowMetrics: {
              activeWorkflows,
              completedToday: parseInt(wf.completed_today, 10),
              pendingApproval: parseInt(wf.pending_approval, 10),
              slaBreaches,
            },
            loopMetrics: {
              completionRate: Math.round(loopCompletionRate),
              totalLoops,
              completedLoops: parseInt(lp.completed, 10),
            },
          },
          request.id,
        ),
      );
    },
  );
}
