import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TeamService, type CreateTeamInput } from '@galaxy/people';
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

const CreateTeamSchema = z.object({
  organizationId: z.string().uuid(),
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(255),
  leadMemberId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const AddTeamMemberSchema = z.object({
  membershipId: z.string().uuid(),
});

export async function teamRoutes(fastify: FastifyInstance): Promise<void> {
  const teamService = new TeamService(fastify.pg);

  fastify.get(
    '/teams',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string; departmentId?: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId, departmentId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const teams = await teamService.list(organizationId, departmentId);
      return reply.send(responseEnvelope(teams, correlationId));
    },
  );

  fastify.post('/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = newCorrelationId();
    const parsed = CreateTeamSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
    }

    const t = parsed.data;
    const teamInput: CreateTeamInput = {
      organizationId: t.organizationId,
      departmentId: t.departmentId,
      name: t.name,
      correlationId,
      actorId: 'system',
      ...(t.leadMemberId !== undefined ? { leadMemberId: t.leadMemberId } : {}),
      ...(t.metadata !== undefined ? { metadata: t.metadata } : {}),
    };

    const team = await teamService.create(teamInput);

    return reply.status(201).send(responseEnvelope(team, correlationId));
  });

  fastify.get(
    '/teams/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const team = await teamService.getById(organizationId, request.params.id);

      if (!team) {
        return reply.status(404).send({ error: 'Team not found' });
      }

      return reply.send(responseEnvelope(team, correlationId));
    },
  );

  fastify.post(
    '/teams/:id/members',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const { organizationId } = request.query;

      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId is required' });
      }

      const parsed = AddTeamMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
      }

      const member = await teamService.addMember(
        organizationId,
        request.params.id,
        parsed.data.membershipId,
      );

      return reply.status(201).send(responseEnvelope(member, correlationId));
    },
  );
}
