import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  HealingIncidentService,
  HealingRuleService,
  HealingEngineService,
} from '@galaxy/self-healing';
import type { HealingLevel, HealingStatus } from '@galaxy/self-healing';

export function selfHealingRoutes(fastify: FastifyInstance): void {
  fastify.post(
    '/self-healing/incidents',
    async (
      request: FastifyRequest<{
        Body: {
          level: HealingLevel;
          description: string;
          affectedResourceType?: string;
          affectedResourceId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { level, description, affectedResourceType, affectedResourceId } = request.body;
      const svc = new HealingIncidentService(fastify.pg);
      const incident = await svc.detectIncident(
        orgId,
        level,
        description,
        affectedResourceType,
        affectedResourceId,
      );
      return reply.status(201).send(incident);
    },
  );

  fastify.get('/self-healing/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const { level, status, limit } = request.query as {
      level?: HealingLevel;
      status?: HealingStatus;
      limit?: string;
    };
    const svc = new HealingIncidentService(fastify.pg);
    return reply.send(
      await svc.listIncidents(
        orgId,
        level,
        status,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      ),
    );
  });

  fastify.get(
    '/self-healing/incidents/:incidentId',
    async (request: FastifyRequest<{ Params: { incidentId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { incidentId } = request.params;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.getIncident(orgId, incidentId));
    },
  );

  fastify.post(
    '/self-healing/incidents/:incidentId/diagnose',
    async (
      request: FastifyRequest<{
        Params: { incidentId: string };
        Body: { diagnosis: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { incidentId } = request.params;
      const { diagnosis } = request.body;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.diagnose(orgId, incidentId, diagnosis));
    },
  );

  fastify.post(
    '/self-healing/incidents/:incidentId/heal',
    async (
      request: FastifyRequest<{
        Params: { incidentId: string };
        Body: { resolution: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { incidentId } = request.params;
      const { resolution } = request.body;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.heal(orgId, incidentId, resolution));
    },
  );

  fastify.post(
    '/self-healing/incidents/:incidentId/escalate',
    async (request: FastifyRequest<{ Params: { incidentId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { incidentId } = request.params;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.escalate(orgId, incidentId));
    },
  );

  fastify.post('/self-healing/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new HealingEngineService(fastify.pg);
    return reply.send(await svc.runHealingCycle(orgId));
  });

  fastify.get('/self-healing/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new HealingEngineService(fastify.pg);
    return reply.send(await svc.getHealingStats(orgId));
  });

  fastify.get('/self-healing/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const { level } = request.query as { level?: HealingLevel };
    const svc = new HealingRuleService(fastify.pg);
    return reply.send(await svc.listRules(orgId, level));
  });

  fastify.post(
    '/self-healing/rules',
    async (
      request: FastifyRequest<{
        Body: {
          level: HealingLevel;
          name: string;
          condition: Record<string, unknown>;
          action: string;
          priority?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { level, name, condition, action, priority } = request.body;
      const svc = new HealingRuleService(fastify.pg);
      const rule = await svc.createRule(orgId, level, name, condition, action, priority);
      return reply.status(201).send(rule);
    },
  );
}
