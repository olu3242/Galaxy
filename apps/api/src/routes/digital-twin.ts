import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  TwinNodeService,
  TwinRelationshipService,
  TwinSnapshotService,
  type TwinNodeType,
  type TwinRelationshipType,
} from '@galaxy/digital-twin';

export function digitalTwinRoutes(fastify: FastifyInstance): void {
  // POST /digital-twin/nodes
  fastify.post(
    '/digital-twin/nodes',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          nodeType: string;
          externalId: string;
          name: string;
          properties?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, nodeType, externalId, name, properties } = request.body;
      const svc = new TwinNodeService(fastify.pg);
      const node = await svc.upsertNode(
        orgId,
        nodeType as TwinNodeType,
        externalId,
        name,
        properties ?? {},
      );
      return reply.status(201).send(node);
    },
  );

  // GET /digital-twin/nodes
  fastify.get(
    '/digital-twin/nodes',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; nodeType?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, nodeType, limit } = request.query;
      const svc = new TwinNodeService(fastify.pg);
      const nodes = await svc.listNodes(
        orgId,
        nodeType as TwinNodeType | undefined,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send(nodes);
    },
  );

  // GET /digital-twin/nodes/:nodeId
  fastify.get(
    '/digital-twin/nodes/:nodeId',
    async (
      request: FastifyRequest<{
        Params: { nodeId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { nodeId } = request.params;
      const { orgId } = request.query;
      const svc = new TwinNodeService(fastify.pg);
      const node = await svc.getNode(orgId, nodeId);
      return reply.send(node);
    },
  );

  // PATCH /digital-twin/nodes/:nodeId/health
  fastify.patch(
    '/digital-twin/nodes/:nodeId/health',
    async (
      request: FastifyRequest<{
        Params: { nodeId: string };
        Body: { orgId: string; score: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { nodeId } = request.params;
      const { orgId, score } = request.body;
      const svc = new TwinNodeService(fastify.pg);
      const node = await svc.updateHealthScore(orgId, nodeId, score);
      return reply.send(node);
    },
  );

  // POST /digital-twin/relationships
  fastify.post(
    '/digital-twin/relationships',
    async (
      request: FastifyRequest<{
        Body: {
          orgId: string;
          sourceNodeId: string;
          targetNodeId: string;
          relationshipType: string;
          weight?: number;
          properties?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, sourceNodeId, targetNodeId, relationshipType, weight, properties } =
        request.body;
      const svc = new TwinRelationshipService(fastify.pg);
      const rel = await svc.createRelationship(
        orgId,
        sourceNodeId,
        targetNodeId,
        relationshipType as TwinRelationshipType,
        weight,
        properties,
      );
      return reply.status(201).send(rel);
    },
  );

  // GET /digital-twin/relationships
  fastify.get(
    '/digital-twin/relationships',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; nodeId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, nodeId } = request.query;
      const svc = new TwinRelationshipService(fastify.pg);
      const rels = await svc.getRelationships(orgId, nodeId);
      return reply.send(rels);
    },
  );

  // DELETE /digital-twin/relationships/:relationshipId
  fastify.delete(
    '/digital-twin/relationships/:relationshipId',
    async (
      request: FastifyRequest<{
        Params: { relationshipId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { relationshipId } = request.params;
      const { orgId } = request.query;
      const svc = new TwinRelationshipService(fastify.pg);
      await svc.deleteRelationship(orgId, relationshipId);
      return reply.status(204).send();
    },
  );

  // POST /digital-twin/snapshots
  fastify.post(
    '/digital-twin/snapshots',
    async (
      request: FastifyRequest<{
        Body: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.body;
      const svc = new TwinSnapshotService(fastify.pg);
      const snapshot = await svc.takeSnapshot(orgId);
      return reply.status(201).send(snapshot);
    },
  );

  // GET /digital-twin/snapshots
  fastify.get(
    '/digital-twin/snapshots',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, limit } = request.query;
      const svc = new TwinSnapshotService(fastify.pg);
      const snapshots = await svc.getSnapshots(
        orgId,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send(snapshots);
    },
  );
}
