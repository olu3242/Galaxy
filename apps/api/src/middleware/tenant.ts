import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

const PUBLIC_PATHS = new Set([
  '/health',
  '/api/v1/webhooks/whatsapp',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
]);

export function registerTenantContext(fastify: FastifyInstance, pool: Pool): void {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (PUBLIC_PATHS.has(request.routeOptions.url ?? request.url)) return;
    const organizationId = request.user.organizationId;
    if (!organizationId) return;
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
  });
}
