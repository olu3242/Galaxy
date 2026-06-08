import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrgGraphService } from '@galaxy/graph';
import type { TraverseDirection } from '@galaxy/graph';

export function graphRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/graph/nodes',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; nodeType?: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, nodeType } = request.query;
      const service = new OrgGraphService(fastify.pg);
      const nodes = await service.listNodes(orgId, nodeType);
      return reply.send({ nodes });
    },
  );

  fastify.post(
    '/graph/nodes',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          nodeType: string;
          externalId: string;
          properties?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, nodeType, externalId, properties } = request.body;
      const service = new OrgGraphService(fastify.pg);
      const node = await service.upsertNode(orgId, nodeType, externalId, properties ?? {});
      return reply.status(201).send({ node });
    },
  );

  fastify.post(
    '/graph/edges',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          edgeType: string;
          sourceNodeId: string;
          targetNodeId: string;
          weight?: number;
          properties?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, edgeType, sourceNodeId, targetNodeId, weight, properties } = request.body;
      const service = new OrgGraphService(fastify.pg);
      const edge = await service.addEdge(
        orgId,
        edgeType,
        sourceNodeId,
        targetNodeId,
        weight ?? 1.0,
        properties ?? {},
      );
      return reply.status(201).send({ edge });
    },
  );

  fastify.delete(
    '/graph/edges/:edgeId',
    async (
      request: FastifyRequest<{ Params: { edgeId: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { edgeId } = request.params;
      const { orgId } = request.query;
      const service = new OrgGraphService(fastify.pg);
      await service.removeEdge(orgId, edgeId);
      return reply.status(204).send();
    },
  );

  fastify.get(
    '/graph/traverse/:nodeId',
    async (
      request: FastifyRequest<{
        Params: { nodeId: string };
        Querystring: { orgId: string; direction?: string; depth?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { nodeId } = request.params;
      const { orgId, direction, depth } = request.query;
      const service = new OrgGraphService(fastify.pg);
      const depthNum = depth ? parseInt(depth, 10) : 3;
      const nodes = await service.traverse(
        orgId,
        nodeId,
        [],
        depthNum,
        (direction ?? 'outbound') as TraverseDirection,
      );
      return reply.send({ nodes });
    },
  );

  fastify.get(
    '/graph/path',
    async (
      request: FastifyRequest<{ Querystring: { orgId: string; from: string; to: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, from, to } = request.query;
      const service = new OrgGraphService(fastify.pg);
      const path = await service.shortestPath(orgId, from, to);
      return reply.send({ path });
    },
  );

  fastify.get(
    '/graph/influence/:memberId',
    async (
      request: FastifyRequest<{ Params: { memberId: string }; Querystring: { orgId: string } }>,
      reply: FastifyReply,
    ) => {
      const { memberId } = request.params;
      const { orgId } = request.query;
      const service = new OrgGraphService(fastify.pg);
      const score = await service.influenceScore(orgId, memberId);
      return reply.send({ memberId, influenceScore: score });
    },
  );

  fastify.get(
    '/graph/bottlenecks',
    async (request: FastifyRequest<{ Querystring: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.query;
      const service = new OrgGraphService(fastify.pg);
      const bottlenecks = await service.findBottlenecks(orgId);
      return reply.send({ bottlenecks });
    },
  );
}
