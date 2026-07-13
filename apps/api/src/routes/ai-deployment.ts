import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DeploymentPlanService, OrgDiscoveryService } from '@galaxy/ai-deployment';

export async function aiDeploymentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/ai-deployment/plans',
    async (
      request: FastifyRequest<{
        Body: { description: string; industryHint?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { description, industryHint } = request.body;
      const svc = new DeploymentPlanService(fastify.pg);
      const plan = await svc.createPlan(orgId, description, industryHint);
      return reply.status(201).send(plan);
    },
  );

  fastify.get('/ai-deployment/plans', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = (request as unknown as { organizationId: string }).organizationId;
    const { limit } = request.query as { limit?: string };
    const svc = new DeploymentPlanService(fastify.pg);
    return reply.send(
      await svc.listPlans(orgId, limit !== undefined ? parseInt(limit, 10) : undefined),
    );
  });

  fastify.get(
    '/ai-deployment/plans/:planId',
    async (request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { planId } = request.params;
      const svc = new DeploymentPlanService(fastify.pg);
      return reply.send(await svc.getPlan(orgId, planId));
    },
  );

  fastify.post(
    '/ai-deployment/plans/:planId/analyze',
    async (request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { planId } = request.params;
      const svc = new DeploymentPlanService(fastify.pg);
      return reply.send(await svc.analyzePlan(orgId, planId));
    },
  );

  fastify.post(
    '/ai-deployment/discovery/sessions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const svc = new OrgDiscoveryService(fastify.pg);
      const session = await svc.startSession(orgId);
      const nextQuestion = svc.getNextQuestion(session);
      return reply.status(201).send({ ...session, nextQuestion });
    },
  );

  fastify.get(
    '/ai-deployment/discovery/sessions/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { sessionId } = request.params;
      const svc = new OrgDiscoveryService(fastify.pg);
      const session = await svc.getSession(orgId, sessionId);
      const nextQuestion = svc.getNextQuestion(session);
      return reply.send({ ...session, nextQuestion });
    },
  );

  fastify.post(
    '/ai-deployment/discovery/sessions/:sessionId/answer',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { answer: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { sessionId } = request.params;
      const { answer } = request.body;
      const svc = new OrgDiscoveryService(fastify.pg);
      return reply.send(await svc.answerQuestion(orgId, sessionId, answer));
    },
  );
}
