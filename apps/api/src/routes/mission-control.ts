import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MissionControlService } from '@galaxy/mission-control';

export async function missionControlRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/mission-control/dashboard',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new MissionControlService(fastify.pg);
      return reply.send(await svc.getDashboard(orgId));
    },
  );

  fastify.get(
    '/mission-control/operational',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new MissionControlService(fastify.pg);
      return reply.send(await svc.getOperationalSnapshot(orgId));
    },
  );

  fastify.get('/mission-control/learning', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new MissionControlService(fastify.pg);
    return reply.send(await svc.getLearningSnapshot(orgId));
  });

  fastify.get('/mission-control/guardian', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const svc = new MissionControlService(fastify.pg);
    return reply.send(await svc.getGuardianSnapshot(orgId));
  });

  fastify.get(
    '/mission-control/digital-twin',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new MissionControlService(fastify.pg);
      return reply.send(await svc.getDigitalTwinSnapshot(orgId));
    },
  );
}
