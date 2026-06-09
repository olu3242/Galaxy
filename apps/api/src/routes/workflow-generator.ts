import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WorkflowGeneratorService, WorkflowTemplateService } from '@galaxy/workflow-generator';

export function workflowGeneratorRoutes(fastify: FastifyInstance): void {
  fastify.post(
    '/workflow-generator/requests',
    async (
      request: FastifyRequest<{
        Body: { description: string; industryHint?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { description, industryHint } = request.body;
      const svc = new WorkflowGeneratorService(fastify.pg);
      const req = await svc.createRequest(orgId, description, industryHint);
      return reply.status(201).send(req);
    },
  );

  fastify.get(
    '/workflow-generator/requests',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { limit } = request.query as { limit?: string };
      const svc = new WorkflowGeneratorService(fastify.pg);
      return reply.send(
        await svc.listRequests(orgId, limit !== undefined ? parseInt(limit, 10) : undefined),
      );
    },
  );

  fastify.get(
    '/workflow-generator/requests/:requestId',
    async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { requestId } = request.params;
      const svc = new WorkflowGeneratorService(fastify.pg);
      return reply.send(await svc.getRequest(orgId, requestId));
    },
  );

  fastify.post(
    '/workflow-generator/requests/:requestId/generate',
    async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
      const orgId = (request as unknown as { organizationId: string }).organizationId;
      const { requestId } = request.params;
      const svc = new WorkflowGeneratorService(fastify.pg);
      return reply.send(await svc.generateWorkflow(orgId, requestId));
    },
  );

  fastify.get('/workflow-generator/templates', (_request: FastifyRequest, reply: FastifyReply) => {
    const svc = new WorkflowTemplateService();
    return reply.send(svc.listTemplates());
  });
}
