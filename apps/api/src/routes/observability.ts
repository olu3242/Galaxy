import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PlatformHealthService } from '@galaxy/observability';
import { MetricsCollectorService } from '@galaxy/observability';
import { AlertService } from '@galaxy/observability';
import { IncidentService } from '@galaxy/observability';
import { SLOService } from '@galaxy/observability';
import type {
  AlertSeverity,
  AlertState,
  IncidentStatus,
  IncidentSeverity,
} from '@galaxy/observability';

function getOrgId(request: FastifyRequest): string {
  const orgId = (request.headers['x-organization-id'] as string | undefined) ?? '';
  if (!orgId) throw new Error('Missing x-organization-id header');
  return orgId;
}

export function observabilityRoutes(fastify: FastifyInstance): void {
  // ---- Health ----
  fastify.get('/observability/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const service = new PlatformHealthService(fastify.pg);
    const checks = await service.getHealth(orgId);
    return reply.send({ checks });
  });

  fastify.post(
    '/observability/health/check',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const service = new PlatformHealthService(fastify.pg);
      const [workflow, agent, sla] = await Promise.all([
        service.checkWorkflowHealth(orgId),
        service.checkAgentHealth(orgId),
        service.checkSLAHealth(orgId),
      ]);
      return reply.send({ checks: { workflow, agent, sla } });
    },
  );

  // ---- Metrics ----
  fastify.post('/observability/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const body = request.body as {
      metricName: string;
      metricValue: number;
      labels: Record<string, string>;
      timestamp?: string;
    };
    const service = new MetricsCollectorService(fastify.pg);
    const metric = await service.record({ organizationId: orgId, ...body });
    return reply.status(201).send({ metric });
  });

  fastify.get(
    '/observability/metrics/query',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const query = request.query as Record<string, string>;
      const metricName = query.metricName ?? '';
      const from = query.from ?? new Date(Date.now() - 3600000).toISOString();
      const to = query.to ?? new Date().toISOString();
      const service = new MetricsCollectorService(fastify.pg);
      const points = await service.query(orgId, {
        metricName,
        from,
        to,
        ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
      });
      return reply.send({ points });
    },
  );

  fastify.get(
    '/observability/metrics/:name/latest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { name } = request.params as { name: string };
      const service = new MetricsCollectorService(fastify.pg);
      const metric = await service.getLatestValue(orgId, name);
      if (!metric) return reply.status(404).send({ error: 'No metrics found' });
      return reply.send({ metric });
    },
  );

  // ---- Alert Rules ----
  fastify.get(
    '/observability/alert-rules',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const service = new AlertService(fastify.pg);
      const rules = await service.listRules(orgId);
      return reply.send({ rules });
    },
  );

  fastify.post(
    '/observability/alert-rules',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const body = request.body as {
        name: string;
        metricName: string;
        threshold: number;
        operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
        severity: AlertSeverity;
      };
      const service = new AlertService(fastify.pg);
      const rule = await service.createRule({ organizationId: orgId, ...body });
      return reply.status(201).send({ rule });
    },
  );

  // ---- Alerts ----
  fastify.get('/observability/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const query = request.query as Record<string, string>;
    const service = new AlertService(fastify.pg);
    const alerts = await service.listAlerts(orgId, {
      ...(query.state !== undefined ? { state: query.state as AlertState } : {}),
      ...(query.severity !== undefined ? { severity: query.severity as AlertSeverity } : {}),
      ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
      ...(query.offset !== undefined ? { offset: parseInt(query.offset, 10) } : {}),
    });
    return reply.send({ alerts });
  });

  fastify.post(
    '/observability/alerts/:id/resolve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new AlertService(fastify.pg);
      const alert = await service.resolveAlert(orgId, id);
      if (!alert) return reply.status(404).send({ error: 'Alert not found or already resolved' });
      return reply.send({ alert });
    },
  );

  // ---- Incidents ----
  fastify.get('/observability/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const query = request.query as Record<string, string>;
    const service = new IncidentService(fastify.pg);
    const incidents = await service.listIncidents(orgId, {
      ...(query.status !== undefined ? { status: query.status as IncidentStatus } : {}),
      ...(query.severity !== undefined ? { severity: query.severity as IncidentSeverity } : {}),
      ...(query.limit !== undefined ? { limit: parseInt(query.limit, 10) } : {}),
      ...(query.offset !== undefined ? { offset: parseInt(query.offset, 10) } : {}),
    });
    return reply.send({ incidents });
  });

  fastify.post('/observability/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const body = request.body as {
      title: string;
      description: string;
      severity: IncidentSeverity;
      metadata: Record<string, unknown>;
    };
    const service = new IncidentService(fastify.pg);
    const incident = await service.createIncident({ organizationId: orgId, ...body });
    return reply.status(201).send({ incident });
  });

  fastify.get(
    '/observability/incidents/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new IncidentService(fastify.pg);
      const incident = await service.getIncident(orgId, id);
      if (!incident) return reply.status(404).send({ error: 'Incident not found' });
      return reply.send({ incident });
    },
  );

  fastify.post(
    '/observability/incidents/:id/acknowledge',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new IncidentService(fastify.pg);
      const incident = await service.acknowledgeIncident(orgId, id);
      if (!incident)
        return reply.status(404).send({ error: 'Incident not found or cannot be acknowledged' });
      return reply.send({ incident });
    },
  );

  fastify.post(
    '/observability/incidents/:id/resolve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new IncidentService(fastify.pg);
      const incident = await service.resolveIncident(orgId, id);
      if (!incident)
        return reply.status(404).send({ error: 'Incident not found or cannot be resolved' });
      return reply.send({ incident });
    },
  );

  fastify.post(
    '/observability/incidents/:id/postmortem',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const body = request.body as { postmortemUrl: string };
      const service = new IncidentService(fastify.pg);
      const incident = await service.addPostmortem(orgId, id, body.postmortemUrl);
      if (!incident) return reply.status(404).send({ error: 'Incident not found' });
      return reply.send({ incident });
    },
  );

  // ---- SLOs ----
  fastify.get('/observability/slos', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const service = new SLOService(fastify.pg);
    const slos = await service.listSLOs(orgId);
    return reply.send({ slos });
  });

  fastify.post('/observability/slos', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const body = request.body as {
      name: string;
      description: string;
      targetPercentage: number;
      windowDays: number;
    };
    const service = new SLOService(fastify.pg);
    const slo = await service.createSLO({ organizationId: orgId, ...body });
    return reply.status(201).send({ slo });
  });

  fastify.get('/observability/slos/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    const service = new SLOService(fastify.pg);
    const slo = await service.getSLO(orgId, id);
    if (!slo) return reply.status(404).send({ error: 'SLO not found' });
    return reply.send({ slo });
  });

  fastify.post(
    '/observability/slos/:id/refresh',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new SLOService(fastify.pg);
      const slo = await service.computeWorkflowSLOCompliance(orgId, id);
      if (!slo) return reply.status(404).send({ error: 'SLO not found' });
      return reply.send({ slo });
    },
  );

  fastify.delete(
    '/observability/slos/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { id } = request.params as { id: string };
      const service = new SLOService(fastify.pg);
      const deleted = await service.deleteSLO(orgId, id);
      if (!deleted) return reply.status(404).send({ error: 'SLO not found' });
      return reply.status(204).send();
    },
  );
}
