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
          query: string;
          context?: Record<string, unknown>;
          correlationId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      // organizationId and actorId come from the verified JWT — never from the body.
      const user = request.user as { sub: string; organizationId: string };
      const { query, context, correlationId } = request.body;
      const copilot = new AliceCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId: user.organizationId,
        query,
        actorId: user.sub,
        correlationId: correlationId ?? randomUUID(),
        ...(context !== undefined ? { context } : {}),
      });
      return reply.send(response);
    },
  );

  // GET /executive/briefing — daily executive intelligence briefing
  fastify.get('/executive/briefing', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { sub: string; organizationId: string };
    const copilot = new AliceCopilot(fastify.pg);
    const response = await copilot.query({
      organizationId: user.organizationId,
      query: 'Provide a comprehensive executive morning briefing covering all key areas.',
      actorId: user.sub,
      correlationId: randomUUID(),
      context: { briefingType: 'daily_morning' },
    });
    return reply.send(response);
  });

  // POST /executive/strategic-review — deep strategic review
  fastify.post(
    '/executive/strategic-review',
    async (
      request: FastifyRequest<{
        Body: {
          reviewPeriod?: 'week' | 'month' | 'quarter';
          correlationId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const user = request.user as { sub: string; organizationId: string };
      const { reviewPeriod = 'week', correlationId } = request.body;
      const copilot = new AliceCopilot(fastify.pg);
      const response = await copilot.query({
        organizationId: user.organizationId,
        query: `Perform a strategic ${reviewPeriod}ly review: highlight wins, risks, blockers, and recommended actions.`,
        actorId: user.sub,
        correlationId: correlationId ?? randomUUID(),
        context: { reviewPeriod },
      });
      return reply.send(response);
    },
  );
}
