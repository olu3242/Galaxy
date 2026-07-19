import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AliceCopilot } from '@galaxy/agents';
import { randomUUID } from 'node:crypto';

/**
 * Executive Intelligence routes — powered by ALICE.
 *
 * All endpoints require an established tenant context (set upstream by
 * TenantContextMiddleware). No PII or sensitive fields are logged.
 */
export async function executiveRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /executive/query — ask ALICE a strategic question
  fastify.post(
    '/executive/query',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          query: string;
          actorId: string;
          context?: Record<string, unknown>;
          correlationId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, query, actorId, context, correlationId } = request.body;
      const copilot = new AliceCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId,
        query,
        actorId,
        correlationId: correlationId ?? randomUUID(),
        ...(context !== undefined ? { context } : {}),
      });
      return reply.send(response);
    },
  );

  // GET /executive/briefing — daily executive intelligence briefing
  fastify.get(
    '/executive/briefing',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; actorId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId } = request.query;
      const copilot = new AliceCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId,
        query: 'Provide a comprehensive executive morning briefing covering all key areas.',
        actorId,
        correlationId: randomUUID(),
        context: { briefingType: 'daily_morning' },
      });
      return reply.send(response);
    },
  );

  // POST /executive/strategic-review — deep strategic review
  fastify.post(
    '/executive/strategic-review',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          actorId: string;
          reviewPeriod?: 'week' | 'month' | 'quarter';
          correlationId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, actorId, reviewPeriod = 'week', correlationId } = request.body;
      const copilot = new AliceCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId,
        query: `Perform a strategic ${reviewPeriod}ly review: highlight wins, risks, blockers, and recommended actions.`,
        actorId,
        correlationId: correlationId ?? randomUUID(),
        context: { reviewPeriod },
      });
      return reply.send(response);
    },
  );
}
