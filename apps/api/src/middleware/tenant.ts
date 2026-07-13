import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

declare module 'fastify' {
  interface FastifyRequest {
    dbClient: PoolClient | null;
  }
}

const PUBLIC_PATHS = new Set([
  '/health',
  '/api/v1/webhooks/whatsapp',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
]);

export function registerTenantContext(fastify: FastifyInstance, pool: Pool): void {
  // Decorate request with null dbClient so the type is always present
  fastify.decorateRequest('dbClient', null);

  // Check out a dedicated connection for this request and set the tenant GUC on it.
  // Using a request-scoped client ensures every query in the handler uses the same
  // connection and therefore sees the correct app.current_tenant setting.
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (PUBLIC_PATHS.has(request.routeOptions.url ?? request.url)) return;
    const organizationId = request.user.organizationId;
    if (!organizationId) return;

    const client = await pool.connect();
    request.dbClient = client;
    // session-local (false) so the setting persists for the connection's lifetime,
    // not just a single transaction that ends immediately after this query.
    await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant', organizationId]);
  });

  // Release the dedicated connection after the response is sent (or on error).
  fastify.addHook('onSend', async (request: FastifyRequest) => {
    if (request.dbClient) {
      // Reset tenant context before returning to pool so subsequent requests
      // on this connection don't inherit a stale tenant setting.
      try {
        await request.dbClient.query('SELECT set_config($1, $2, false)', [
          'app.current_tenant',
          '',
        ]);
      } finally {
        request.dbClient.release();
        request.dbClient = null;
      }
    }
  });

  fastify.addHook('onError', async (request: FastifyRequest) => {
    if (request.dbClient) {
      try {
        await request.dbClient.query('SELECT set_config($1, $2, false)', [
          'app.current_tenant',
          '',
        ]);
      } finally {
        request.dbClient.release();
        request.dbClient = null;
      }
    }
  });
}
