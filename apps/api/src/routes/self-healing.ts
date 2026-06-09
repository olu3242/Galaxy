import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  HealingIncidentService,
  HealingRuleService,
  HealingEngineService,
} from '@galaxy/self-healing';
import type { HealingLevel, HealingStatus, HealingTrigger } from '@galaxy/self-healing';

export function selfHealingRoutes(fastify: FastifyInstance): void {
  fastify.post(
    '/self-healing/incidents',
    async (
      request: FastifyRequest<{
        Body: {
          level: HealingLevel;
          description: string;
          trigger?: HealingTrigger;
          affectedResourceType?: string;
          affectedResourceId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingIncidentService(fastify.pg);
      const incident = await svc.detectIncident(
        orgId,
        request.body.level,
        request.body.description,
        request.body.affectedResourceType,
        request.body.affectedResourceId,
      );
      return reply.status(201).send(incident);
    },
  );

  fastify.get(
    '/self-healing/incidents',
    async (
      request: FastifyRequest<{
        Querystring: { level?: HealingLevel; status?: HealingStatus; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingIncidentService(fastify.pg);
      const { level, status, limit } = request.query;
      return reply.send(
        await svc.listIncidents(orgId, level, status, limit ? parseInt(limit, 10) : undefined),
      );
    },
  );

  fastify.get(
    '/self-healing/incidents/:incidentId',
    async (request: FastifyRequest<{ Params: { incidentId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.getIncident(orgId, request.params.incidentId));
    },
  );

  fastify.post(
    '/self-healing/incidents/:incidentId/diagnose',
    async (
      request: FastifyRequest<{ Params: { incidentId: string }; Body: { diagnosis: string } }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(
        await svc.diagnose(orgId, request.params.incidentId, request.body.diagnosis),
      );
    },
  );

  fastify.post(
    '/self-healing/incidents/:incidentId/heal',
    async (
      request: FastifyRequest<{ Params: { incidentId: string }; Body: { resolution: string } }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.heal(orgId, request.params.incidentId, request.body.resolution));
    },
  );

  fastify.post(
    '/self-healing/incidents/:incidentId/escalate',
    async (request: FastifyRequest<{ Params: { incidentId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingIncidentService(fastify.pg);
      return reply.send(await svc.escalate(orgId, request.params.incidentId));
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

  fastify.get(
    '/self-healing/rules',
    async (
      request: FastifyRequest<{ Querystring: { level?: HealingLevel } }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new HealingRuleService(fastify.pg);
      return reply.send(await svc.listRules(orgId, request.query.level));
    },
  );

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
      const svc = new HealingRuleService(fastify.pg);
      const rule = await svc.createRule(
        orgId,
        request.body.level,
        request.body.name,
        request.body.condition,
        request.body.action,
        request.body.priority,
      );
      return reply.status(201).send(rule);
    },
  );
}
