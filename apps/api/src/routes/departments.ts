import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DepartmentService, type CreateDepartmentInput } from '@galaxy/people';
import { newCorrelationId } from '@galaxy/utils';

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

const CreateDeptSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  parentDepartmentId: z.string().uuid().optional(),
  headMemberId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function departmentRoutes(fastify: FastifyInstance): Promise<void> {
  const deptService = new DepartmentService(fastify.pg);

  fastify.get(
    '/departments',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const departments = await deptService.list(organizationId);
      return reply.send(responseEnvelope(departments, correlationId));
    },
  );

  fastify.post('/departments', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = newCorrelationId();
    const parsed = CreateDeptSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
    }

    const d = parsed.data;
    const deptInput: CreateDepartmentInput = {
      organizationId: d.organizationId,
      name: d.name,
      correlationId,
      actorId: 'system',
      ...(d.parentDepartmentId !== undefined ? { parentDepartmentId: d.parentDepartmentId } : {}),
      ...(d.headMemberId !== undefined ? { headMemberId: d.headMemberId } : {}),
      ...(d.metadata !== undefined ? { metadata: d.metadata } : {}),
    };

    const dept = await deptService.create(deptInput);

    return reply.status(201).send(responseEnvelope(dept, correlationId));
  });

  fastify.get(
    '/departments/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const dept = await deptService.getById(organizationId, request.params.id);

      if (!dept) {
        return reply.status(404).send({ error: 'Department not found' });
      }

      return reply.send(responseEnvelope(dept, correlationId));
    },
  );
}
