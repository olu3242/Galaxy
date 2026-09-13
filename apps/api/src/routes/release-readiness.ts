import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface MigrationRow {
  exists: boolean;
}

function configured(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0;
}

export async function releaseReadinessRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/system/readiness', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = {
      database: false,
      workflowReplaySafety: false,
      redisConfigured: configured('REDIS_URL'),
      whatsappConfigured: configured('WHATSAPP_APP_SECRET'),
      aiConfigured: configured('ANTHROPIC_API_KEY'),
      jwtConfigured: configured('JWT_SECRET'),
    };

    try {
      await fastify.pg.query('SELECT 1');
      checks.database = true;

      const migration = await fastify.pg.query<MigrationRow>(
        `SELECT EXISTS (
           SELECT 1 FROM schema_migrations
           WHERE name = '102_workflow_execution_receipts'
         ) AS exists`,
      );
      checks.workflowReplaySafety = migration.rows[0]?.exists === true;
    } catch (error) {
      request.log.error({ error }, 'release readiness database check failed');
    }

    const ready = Object.values(checks).every(Boolean);
    return reply.status(ready ? 200 : 503).send({
      ready,
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
