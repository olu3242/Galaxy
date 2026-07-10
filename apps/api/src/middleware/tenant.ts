import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

const PUBLIC_PATHS = new Set(['/health', '/api/v1/webhooks/whatsapp']);

export function registerTenantContext(fastify: FastifyInstance, pool: Pool): void {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (PUBLIC_PATHS.has(request.routeOptions.url ?? request.url)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const organizationId = (request.user as any)?.organizationId as string | undefined;
    if (!organizationId) return;
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
  });
}
