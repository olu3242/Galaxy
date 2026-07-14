import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MemberService, type UpdateMemberInput } from '@galaxy/people';
import { newCorrelationId } from '@galaxy/utils';
import { randomUUID } from 'crypto';

function responseEnvelope<T>(data: T, requestId: string) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

const CreateMemberSchema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().min(1).max(255),
  whatsappPhone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  roleId: z.string().uuid().optional().nullable(),
});

const UpdateMemberSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  profileData: z.record(z.unknown()).optional(),
});

interface NewMemberRow {
  id: string;
  display_name: string;
  whatsapp_phone: string | null;
  email: string | null;
  created_at: string;
}

interface NewMembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string | null;
  status: string;
  created_at: string;
}

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  const memberService = new MemberService(fastify.pg);

  fastify.post(
    '/members',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          displayName: string;
          whatsappPhone?: string | null;
          email?: string | null;
          roleId?: string | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const correlationId = newCorrelationId();
      const parsed = CreateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', details: parsed.error.errors });
      }

      const { organizationId, displayName, whatsappPhone, email, roleId } = parsed.data;
      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      // Create user then membership in a transaction
      const userId = randomUUID();
      const userResult = await fastify.pg.query<NewMemberRow>(
        `INSERT INTO users (id, organization_id, display_name, whatsapp_phone, email)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, display_name, whatsapp_phone, email, created_at`,
        [userId, organizationId, displayName, whatsappPhone ?? null, email ?? null],
      );
      const user = userResult.rows[0];
      if (!user) {
        return reply.status(500).send({ error: 'Failed to create user' });
      }

      const membershipResult = await fastify.pg.query<NewMembershipRow>(
        `INSERT INTO memberships (organization_id, user_id, role_id)
         VALUES ($1, $2, $3)
         RETURNING id, organization_id, user_id, role_id, status, created_at`,
        [organizationId, userId, roleId ?? null],
      );
      const membership = membershipResult.rows[0];
      if (!membership) {
        return reply.status(500).send({ error: 'Failed to create membership' });
      }

      return reply.status(201).send(
        responseEnvelope(
          {
            id: membership.id,
            organizationId,
            userId,
            displayName: user.display_name,
            whatsappPhone: user.whatsapp_phone,
            email: user.email,
            roleId: membership.role_id,
            status: membership.status,
            createdAt: user.created_at,
            correlationId,
          },
          correlationId,
        ),
      );
    },
  );

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
