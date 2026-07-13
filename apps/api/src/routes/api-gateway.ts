import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  GatewayRouteService,
  GatewayRateLimitService,
  GatewayAnalyticsService,
} from '@galaxy/api-gateway';
import type {
  RegisterRouteInput,
  HttpMethod,
  ApiVersion,
  RateLimitTier,
} from '@galaxy/api-gateway';

export async function apiGatewayRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/gateway/routes — list registered routes
  fastify.get(
    '/gateway/routes',
    async (request: FastifyRequest<{ Querystring: { version?: string } }>, reply: FastifyReply) => {
      const service = new GatewayRouteService(fastify.pg);
      const version = request.query.version as ApiVersion | undefined;
      const routes = await service.listRoutes(version);
      return reply.send({ routes });
    },
  );

  // POST /api/v1/gateway/routes — register a new route (admin only)
  fastify.post(
    '/gateway/routes',
    async (
      request: FastifyRequest<{
        Body: {
          path: string;
          method: string;
          version: string;
          authRequired: boolean;
          rateLimitTier: string;
          description: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const body = request.body;
      const service = new GatewayRouteService(fastify.pg);
      const input: RegisterRouteInput = {
        path: body.path,
        method: body.method as HttpMethod,
        version: body.version as ApiVersion,
        authRequired: body.authRequired,
        rateLimitTier: body.rateLimitTier as RateLimitTier,
        description: body.description,
      };
      const route = await service.registerRoute(input);
      return reply.status(201).send({ route });
    },
  );

  // GET /api/v1/gateway/stats — overall stats
  fastify.get(
    '/gateway/stats',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId?: string; windowHours?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = request.query.organizationId;
      if (!orgId) {
        return reply.status(400).send({ error: 'organizationId query param is required' });
      }
      const windowHours = request.query.windowHours === '168' ? 168 : 24;
      const service = new GatewayAnalyticsService(fastify.pg);
      const stats = await service.getStats(orgId, windowHours);
      return reply.send({ stats });
    },
  );

  // GET /api/v1/gateway/stats/by-endpoint — per-endpoint breakdown
  fastify.get(
    '/gateway/stats/by-endpoint',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId?: string; windowHours?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const orgId = request.query.organizationId;
      if (!orgId) {
        return reply.status(400).send({ error: 'organizationId query param is required' });
      }
      const windowHours = request.query.windowHours === '168' ? 168 : 24;
      const service = new GatewayAnalyticsService(fastify.pg);
      const endpoints = await service.getStatsByEndpoint(orgId, windowHours);
      return reply.send({ endpoints });
    },
  );

  // GET /api/v1/gateway/ratelimit/status — check rate limit status for caller's org
  fastify.get(
    '/gateway/ratelimit/status',
    async (
      request: FastifyRequest<{
        Querystring: { apiKeyId?: string; tier?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const apiKeyId = request.query.apiKeyId;
      if (!apiKeyId) {
        return reply.status(400).send({ error: 'apiKeyId query param is required' });
      }
      const tier = (request.query.tier ?? 'basic') as RateLimitTier;
      const service = new GatewayRateLimitService(fastify.pg);
      const status = await service.getStatus(apiKeyId, tier);
      const headers = service.buildHeaders(status);
      for (const [key, value] of Object.entries(headers)) {
        void reply.header(key, value);
      }
      return reply.send({ rateLimitStatus: status });
    },
  );
}
