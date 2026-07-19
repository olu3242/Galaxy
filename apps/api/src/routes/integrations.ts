import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IntegrationConnectorService } from '@galaxy/integrations';
import { IntegrationSyncService } from '@galaxy/integrations';
import type { ConnectorType, SyncDirection } from '@galaxy/integrations';

function getOrgId(request: FastifyRequest): string {
  const orgId = (request.headers['x-organization-id'] as string | undefined) ?? '';
  if (!orgId) throw new Error('Missing x-organization-id header');
  return orgId;
}

export async function integrationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /integrations — list org's connectors
  fastify.get('/integrations', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const service = new IntegrationConnectorService(fastify.pg);
    const connectors = await service.listConnectors(orgId);
    return reply.send({ connectors });
  });

  // POST /integrations — add connector
  fastify.post('/integrations', async (request: FastifyRequest, reply: FastifyReply) => {
    const orgId = getOrgId(request);
    const body = request.body as {
      name: string;
      connectorType: ConnectorType;
      config: Record<string, unknown>;
      credentials: Record<string, unknown>;
    };
    const service = new IntegrationConnectorService(fastify.pg);
    const connector = await service.registerConnector({
      organizationId: orgId,
      name: body.name,
      connectorType: body.connectorType,
      config: body.config,
      credentials: body.credentials,
    });
    return reply.status(201).send({ connector });
  });

  // PUT /integrations/:connectorId/enable
  fastify.put(
    '/integrations/:connectorId/enable',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { connectorId } = request.params as { connectorId: string };
      const service = new IntegrationConnectorService(fastify.pg);
      const connector = await service.enableConnector(orgId, connectorId);
      return reply.send({ connector });
    },
  );

  // PUT /integrations/:connectorId/disable
  fastify.put(
    '/integrations/:connectorId/disable',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { connectorId } = request.params as { connectorId: string };
      const service = new IntegrationConnectorService(fastify.pg);
      const connector = await service.disableConnector(orgId, connectorId);
      return reply.send({ connector });
    },
  );

  // GET /integrations/:connectorId/logs — sync history
  fastify.get(
    '/integrations/:connectorId/logs',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { connectorId } = request.params as { connectorId: string };
      const query = request.query as Record<string, string>;
      const limit = query.limit !== undefined ? parseInt(query.limit, 10) : 50;
      const offset = query.offset !== undefined ? parseInt(query.offset, 10) : 0;
      const service = new IntegrationSyncService(fastify.pg);
      const logs = await service.listSyncLogs(orgId, connectorId, limit, offset);
      return reply.send({ logs });
    },
  );

  // POST /integrations/:connectorId/sync — trigger manual sync
  fastify.post(
    '/integrations/:connectorId/sync',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const orgId = getOrgId(request);
      const { connectorId } = request.params as { connectorId: string };
      const body = request.body as { direction?: SyncDirection };
      const service = new IntegrationSyncService(fastify.pg);
      const syncLog = await service.triggerSync({
        organizationId: orgId,
        connectorId,
        direction: body.direction ?? 'bidirectional',
      });
      return reply.status(202).send({ syncLog });
    },
  );
}
