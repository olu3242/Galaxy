import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MemberService, type UpdateMemberInput } from '@galaxy/people';
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

const UpdateMemberSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  profileData: z.record(z.unknown()).optional(),
});

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  const memberService = new MemberService(fastify.pg);

  fastify.get(
    '/members',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; status?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId, status, limit, offset } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const options: { status?: string; limit?: number; offset?: number } = {};
      if (status !== undefined) options.status = status;
      if (limit !== undefined) options.limit = parseInt(limit, 10);
      if (offset !== undefined) options.offset = parseInt(offset, 10);

      const members = await memberService.list(organizationId, options);

      return reply.send(responseEnvelope(members, correlationId));
    },
  );

  fastify.get(
    '/members/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const member = await memberService.getById(organizationId, request.params.id);

      if (!member) {
        return reply.status(404).send({ error: 'Member not found' });
      }

      return reply.send(responseEnvelope(member, correlationId));
    },
  );

  fastify.patch(
    '/members/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { organizationId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const parsed = UpdateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
      }

      const updateInput: UpdateMemberInput = {
        correlationId,
        actorId: 'system',
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.profileData !== undefined ? { profileData: parsed.data.profileData } : {}),
      };

      const member = await memberService.update(organizationId, request.params.id, updateInput);

      return reply.send(responseEnvelope(member, correlationId));
    },
  );
}
