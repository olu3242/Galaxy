import Fastify, { type FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { organizationRoutes } from './routes/organizations.js';
import { memberRoutes } from './routes/members.js';
import { departmentRoutes } from './routes/departments.js';
import { teamRoutes } from './routes/teams.js';
import { roleRoutes } from './routes/roles.js';
import { auditRoutes } from './routes/audit.js';
import { analyticsRoutes } from './routes/analytics.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { workflowOsRoutes } from './routes/workflow-os.js';

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool;
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'body.password', 'body.token', 'body.secret'],
    },
  });

  // Database pool
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  // Decorate fastify with pg pool
  fastify.decorate('pg', pool);

  // Health check — no auth required
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register API routes
  await fastify.register(organizationRoutes, { prefix: '/api/v1' });
  await fastify.register(memberRoutes, { prefix: '/api/v1' });
  await fastify.register(departmentRoutes, { prefix: '/api/v1' });
  await fastify.register(teamRoutes, { prefix: '/api/v1' });
  await fastify.register(roleRoutes, { prefix: '/api/v1' });
  await fastify.register(auditRoutes, { prefix: '/api/v1' });
  await fastify.register(analyticsRoutes, { prefix: '/api/v1' });
  await fastify.register(knowledgeRoutes, { prefix: '/api/v1' });
  await fastify.register(intelligenceRoutes, { prefix: '/api/v1' });
  await fastify.register(workflowOsRoutes, { prefix: '/api/v1' });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await pool.end();
  });

  return fastify;
}

async function main(): Promise<void> {
  const app = await buildApp();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`Galaxy API listening on ${host}:${String(port)}`);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
