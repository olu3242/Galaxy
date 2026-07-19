import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { APIKeyService, WebhookService, OAuthService } from '@galaxy/developer';
import type {
  CreateAPIKeyInput,
  CreateWebhookInput,
  RegisterOAuthAppInput,
} from '@galaxy/developer';

export async function developerRoutes(fastify: FastifyInstance): Promise<void> {
  // ── API Keys ──────────────────────────────────────────────────────────────

  fastify.get(
    '/developer/organizations/:orgId/api-keys',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.params;
      const service = new APIKeyService(fastify.pg);
      const keys = await service.listKeys(orgId);
      // Never return the hashed secret in listings
      const safeKeys = keys.map(({ hashedSecret: _, ...rest }) => rest);
      return reply.send({ keys: safeKeys });
    },
  );

  fastify.post(
    '/developer/organizations/:orgId/api-keys',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: { name: string; scopes: string[]; createdBy: string; expiresAt?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const body = request.body;
      const service = new APIKeyService(fastify.pg);

      const input: CreateAPIKeyInput = {
        organizationId: orgId,
        name: body.name,
        scopes: body.scopes,
        createdBy: body.createdBy,
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
      };

      const { plainSecret, hashedSecret: _, ...key } = await service.generateKey(input);
      return reply.status(201).send({ key, plainSecret });
    },
  );

  fastify.post(
    '/developer/organizations/:orgId/api-keys/:keyId/rotate',
    async (
      request: FastifyRequest<{ Params: { orgId: string; keyId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, keyId } = request.params;
      const service = new APIKeyService(fastify.pg);
      const { plainSecret, hashedSecret: _, ...key } = await service.rotateKey(orgId, keyId);
      return reply.send({ key, plainSecret });
    },
  );

  fastify.delete(
    '/developer/organizations/:orgId/api-keys/:keyId',
    async (
      request: FastifyRequest<{ Params: { orgId: string; keyId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, keyId } = request.params;
      const service = new APIKeyService(fastify.pg);
      const key = await service.revokeKey(orgId, keyId);
      const { hashedSecret: _, ...safeKey } = key;
      return reply.send({ key: safeKey });
    },
  );

  // ── Webhooks ──────────────────────────────────────────────────────────────

  fastify.get(
    '/developer/organizations/:orgId/webhooks',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.params;
      const service = new WebhookService(fastify.pg);
      const webhooks = await service.listWebhooks(orgId);
      // Never expose the signing secret
      const safeWebhooks = webhooks.map(({ secret: _, ...rest }) => rest);
      return reply.send({ webhooks: safeWebhooks });
    },
  );

  fastify.post(
    '/developer/organizations/:orgId/webhooks',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: { name: string; url: string; eventTypes: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const body = request.body;
      const service = new WebhookService(fastify.pg);

      const input: CreateWebhookInput = {
        organizationId: orgId,
        name: body.name,
        url: body.url,
        eventTypes: body.eventTypes,
      };

      const webhook = await service.registerWebhook(input);
      // Return the secret once on creation only
      return reply.status(201).send({ webhook });
    },
  );

  fastify.put(
    '/developer/organizations/:orgId/webhooks/:webhookId',
    async (
      request: FastifyRequest<{
        Params: { orgId: string; webhookId: string };
        Body: { name?: string; url?: string; eventTypes?: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, webhookId } = request.params;
      const body = request.body;
      const service = new WebhookService(fastify.pg);
      const webhook = await service.updateWebhook(orgId, webhookId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.eventTypes !== undefined ? { eventTypes: body.eventTypes } : {}),
      });
      const { secret: _, ...safeWebhook } = webhook;
      return reply.send({ webhook: safeWebhook });
    },
  );

  fastify.delete(
    '/developer/organizations/:orgId/webhooks/:webhookId',
    async (
      request: FastifyRequest<{ Params: { orgId: string; webhookId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, webhookId } = request.params;
      const service = new WebhookService(fastify.pg);
      await service.deleteWebhook(orgId, webhookId);
      return reply.status(204).send();
    },
  );

  fastify.get(
    '/developer/organizations/:orgId/webhooks/:webhookId/deliveries',
    async (
      request: FastifyRequest<{
        Params: { orgId: string; webhookId: string };
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, webhookId } = request.params;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const service = new WebhookService(fastify.pg);
      const deliveries = await service.listDeliveries(orgId, webhookId, limit);
      return reply.send({ deliveries });
    },
  );

  // ── OAuth Apps ────────────────────────────────────────────────────────────

  fastify.get(
    '/developer/organizations/:orgId/oauth-apps',
    async (request: FastifyRequest<{ Params: { orgId: string } }>, reply: FastifyReply) => {
      const { orgId } = request.params;
      const service = new OAuthService(fastify.pg);
      const apps = await service.listApps(orgId);
      const safeApps = apps.map(({ hashedClientSecret: _, ...rest }) => rest);
      return reply.send({ apps: safeApps });
    },
  );

  fastify.post(
    '/developer/organizations/:orgId/oauth-apps',
    async (
      request: FastifyRequest<{
        Params: { orgId: string };
        Body: {
          name: string;
          redirectUris: string[];
          scopes: string[];
          grantTypes: RegisterOAuthAppInput['grantTypes'];
          createdBy: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId } = request.params;
      const body = request.body;
      const service = new OAuthService(fastify.pg);

      const input: RegisterOAuthAppInput = {
        organizationId: orgId,
        name: body.name,
        redirectUris: body.redirectUris,
        scopes: body.scopes,
        grantTypes: body.grantTypes,
        createdBy: body.createdBy,
      };

      const { app, clientSecret } = await service.registerApp(input);
      const { hashedClientSecret: _, ...safeApp } = app;
      return reply.status(201).send({ app: safeApp, clientSecret });
    },
  );

  fastify.get(
    '/developer/organizations/:orgId/oauth-apps/:appId',
    async (
      request: FastifyRequest<{ Params: { orgId: string; appId: string } }>,
      reply: FastifyReply,
    ) => {
      const { orgId, appId } = request.params;
      const service = new OAuthService(fastify.pg);
      const app = await service.getApp(orgId, appId);
      if (!app) {
        return reply.status(404).send({ error: 'OAuth app not found' });
      }
      const { hashedClientSecret: _, ...safeApp } = app;
      return reply.send({ app: safeApp });
    },
  );

  // OAuth token exchange
  fastify.post(
    '/developer/oauth/token',
    async (
      request: FastifyRequest<{
        Body: {
          grant_type: string;
          code: string;
          client_id: string;
          client_secret: string;
          redirect_uri: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const body = request.body;

      if (body.grant_type !== 'authorization_code') {
        return reply.status(400).send({ error: 'Unsupported grant_type' });
      }

      const service = new OAuthService(fastify.pg);

      try {
        const token = await service.exchangeCodeForToken(
          body.code,
          body.client_id,
          body.client_secret,
          body.redirect_uri,
        );
        return await reply.send({
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
          token_type: 'Bearer',
          expires_at: token.expiresAt,
          scope: token.scopes.join(' '),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Token exchange failed';
        return reply.status(400).send({ error: message });
      }
    },
  );
}
