import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OrganizationService, type CreateOrganizationInput } from '@galaxy/identity';
import { newCorrelationId } from '@galaxy/utils';

const CreateOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  industryType: z.string().min(1),
  planTier: z.enum(['starter', 'growth', 'enterprise']).optional(),
  whatsappPhoneNumberId: z.string().optional(),
});

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function organizationRoutes(fastify: FastifyInstance): void {
  const orgService = new OrganizationService(fastify.pg);

  fastify.post('/organizations', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = newCorrelationId();

    const parsed = CreateOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parsed.error.errors,
      });
    }

    const input = parsed.data;

    const orgInput: CreateOrganizationInput = {
      name: input.name,
      slug: input.slug,
      industryType: input.industryType,
      correlationId,
      actorId: 'system',
      ...(input.planTier !== undefined ? { planTier: input.planTier } : {}),
      ...(input.whatsappPhoneNumberId !== undefined
        ? { whatsappPhoneNumberId: input.whatsappPhoneNumberId }
        : {}),
    };

    const org = await orgService.create(orgInput);

    return reply.status(201).send(responseEnvelope(org, correlationId));
  });

  fastify.get(
    '/organizations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const correlationId = newCorrelationId();
      const org = await orgService.getById(request.params.id);

      if (!org) {
        return reply.status(404).send({ error: 'Organization not found' });
      }

      return reply.send(responseEnvelope(org, correlationId));
    },
  );
}
