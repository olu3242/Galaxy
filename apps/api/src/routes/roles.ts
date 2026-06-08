import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RoleService, PermissionService, type CreateRoleInput } from '@galaxy/identity';
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

const CreateRoleSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  scope: z.enum(['platform', 'organization', 'department', 'team']).optional(),
  description: z.string().optional(),
});

const AssignPermissionSchema = z.object({
  permissionId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export function roleRoutes(fastify: FastifyInstance): void {
  const roleService = new RoleService(fastify.pg);
  const permService = new PermissionService(fastify.pg);

  fastify.get(
    '/roles',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const roles = await roleService.getRolesForOrg(organizationId);
      return reply.send(responseEnvelope(roles, correlationId));
    },
  );

  fastify.post('/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = newCorrelationId();
    const parsed = CreateRoleSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
    }

    const r = parsed.data;
    const roleInput: CreateRoleInput = {
      organizationId: r.organizationId,
      name: r.name,
      slug: r.slug,
      correlationId,
      actorId: 'system',
      ...(r.scope !== undefined ? { scope: r.scope } : {}),
      ...(r.description !== undefined ? { description: r.description } : {}),
    };

    const role = await roleService.createRole(roleInput);

    return reply.status(201).send(responseEnvelope(role, correlationId));
  });

  fastify.post(
    '/roles/:id/permissions',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const correlationId = newCorrelationId();
      const parsed = AssignPermissionSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
      }

      await permService.assignPermissionToRole(
        parsed.data.organizationId,
        request.params.id,
        parsed.data.permissionId,
      );

      return reply.send(responseEnvelope({ assigned: true }, correlationId));
    },
  );
}
