import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  AgentRegistryService,
  AgentActionService,
  AgentInsightService,
} from '@galaxy/autonomous-intelligence';
import type { AgentStatus, AgentType } from '@galaxy/autonomous-intelligence';

export async function autonomousIntelligenceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/autonomous-intelligence/agents',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new AgentRegistryService(fastify.pg);
      const agents = await service.listAgents(orgId);
      return reply.send({ agents });
    },
  );

  fastify.post(
    '/autonomous-intelligence/agents',
    async (
      request: FastifyRequest<{
        Body: { orgId: string; agentType: AgentType; config: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, agentType, config } = request.body;
      const service = new AgentRegistryService(fastify.pg);
      const agent = await service.registerAgent(orgId, agentType, config);
      return reply.status(201).send({ agent });
    },
  );

  fastify.get(
    '/autonomous-intelligence/agents/:agentId',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { orgId } = request.query;
      const service = new AgentRegistryService(fastify.pg);
      const agent = await service.getAgent(orgId, agentId);
      return reply.send({ agent });
    },
  );

  fastify.patch(
    '/autonomous-intelligence/agents/:agentId/status',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: { orgId: string; status: AgentStatus };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { orgId, status } = request.body;
      const service = new AgentRegistryService(fastify.pg);
      const agent = await service.updateAgentStatus(orgId, agentId, status);
      return reply.send({ agent });
    },
  );

  fastify.get(
    '/autonomous-intelligence/agents/:agentId/actions',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Querystring: { orgId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { orgId, limit } = request.query;
      const service = new AgentActionService(fastify.pg);
      const actions = await service.getActions(
        orgId,
        agentId,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send({ actions });
    },
  );

  fastify.get(
    '/autonomous-intelligence/agents/:agentId/insights',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Querystring: { orgId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { orgId, limit } = request.query;
      const service = new AgentInsightService(fastify.pg);
      const insights = await service.getInsights(
        orgId,
        agentId,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send({ insights });
    },
  );

  fastify.post(
    '/autonomous-intelligence/agents/:agentId/insights',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: {
          orgId: string;
          insightType: string;
          title: string;
          description: string;
          confidence: number;
          data: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { agentId } = request.params;
      const { orgId, insightType, title, description, confidence, data } = request.body;
      const service = new AgentInsightService(fastify.pg);
      const insight = await service.recordInsight(
        orgId,
        agentId,
        insightType,
        title,
        description,
        confidence,
        data,
      );
      return reply.status(201).send({ insight });
    },
  );
}
