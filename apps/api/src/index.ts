import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyWebSocket from '@fastify/websocket';
import { Pool } from 'pg';
import { registerAuth } from './middleware/auth.js';
import { registerTenantContext } from './middleware/tenant.js';
import { registerAbacPlugin } from './middleware/abac.js';
import { registerAuthorizationPlugin } from './middleware/authorization.js';
import { registerRuntimePipeline } from './plugins/runtime-pipeline.js';
import { whatsappWebhookRoutes } from './routes/webhooks-whatsapp.js';
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
import { agentOsRoutes } from './routes/agent-os.js';
import { billingRoutes } from './routes/billing.js';
import { developerRoutes } from './routes/developer.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { observabilityRoutes } from './routes/observability.js';
import { governanceRoutes } from './routes/governance.js';
import { platformAdminRoutes } from './routes/platform-admin.js';
import { apiGatewayRoutes } from './routes/api-gateway.js';
import { integrationRoutes } from './routes/integrations.js';
import { graphRoutes } from './routes/graph.js';
import { cooRoutes } from './routes/coo.js';
import { orgMemoryRoutes } from './routes/org-memory.js';
import { solutionPackRoutes } from './routes/solution-packs.js';
import { partnerRoutes } from './routes/partner.js';
import { economyRoutes } from './routes/economy.js';
import { predictiveRoutes } from './routes/predictive.js';
import { riskIntelligenceRoutes } from './routes/risk-intelligence.js';
import { intelligenceNetworkRoutes } from './routes/intelligence-network.js';
import { benchmarkingRoutes } from './routes/benchmarking.js';
import { conversationRoutes } from './routes/conversation.js';
import { autonomousIntelligenceRoutes } from './routes/autonomous-intelligence.js';
import { digitalTwinRoutes } from './routes/digital-twin.js';
import { policyEngineRoutes } from './routes/policy-engine.js';
import { orgDnaRoutes } from './routes/org-dna.js';
import { orgHealthRoutes } from './routes/org-health.js';
import { workflowGeneratorRoutes } from './routes/workflow-generator.js';
import { selfHealingRoutes } from './routes/self-healing.js';
import { aiDeploymentRoutes } from './routes/ai-deployment.js';
import { missionControlRoutes } from './routes/mission-control.js';
import { reliabilityRoutes } from './routes/reliability.js';
import { platformRoutes } from './routes/platform.js';
import { platformAdminV2Routes } from './routes/platform-admin-v2.js';
import { wrfRoutes } from './routes/wrf.js';
import { aofRoutes } from './routes/aof.js';
import { billingV2Routes } from './routes/billing-v2.js';
import { loopRoutes } from './routes/loop.js';
import { broadcastRoutes } from './routes/broadcast.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { eventsSseRoutes } from './routes/events-sse.js';
import { eventsWsRoutes } from './routes/events-ws.js';
import { authRoutes } from './routes/auth.js';
import { frontendCompatRoutes } from './routes/frontend-compat.js';
import { executiveRoutes } from './routes/executive.js';
import { workflowGenRoutes } from './routes/workflow-gen.js';
import { approvalRoutes } from './routes/approvals.js';

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

  // CORS — allow cross-origin requests from the web app (dev/test)
  await fastify.register(fastifyWebSocket);

  await fastify.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
  });

  // Enable raw body capture for HMAC signature verification on webhook routes
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as typeof req & { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse(body.toString()) as unknown);
    } catch (err) {
      done(err as Error);
    }
  });

  // Database pool
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  // Decorate fastify with pg pool
  fastify.decorate('pg', pool);

  // Auth — JWT verification (skips /health and /api/v1/webhooks/whatsapp)
  await registerAuth(fastify);

  // Tenant context — injects organizationId into DB session (skips public paths)
  registerTenantContext(fastify, pool);

  // ABAC — legacy attribute-based access control decorators (checkAbac, assertAbac)
  registerAbacPlugin(fastify);

  // Authorization Pipeline — unified RBAC+ABAC engine via Organization OS (authorize, assertAuthorized)
  registerAuthorizationPlugin(fastify);

  // Runtime Pipeline — threads correlationId; emits GalaxyEvent + audit log on mutating requests
  registerRuntimePipeline(fastify, pool);

  // Health check — no auth required
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // WhatsApp inbound webhook — no JWT, uses HMAC signature verification
  await fastify.register(whatsappWebhookRoutes, { prefix: '/api/v1' });

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
  await fastify.register(agentOsRoutes, { prefix: '/api/v1' });
  await fastify.register(billingRoutes, { prefix: '/api/v1' });
  await fastify.register(developerRoutes, { prefix: '/api/v1' });
  await fastify.register(marketplaceRoutes, { prefix: '/api/v1' });
  await fastify.register(observabilityRoutes, { prefix: '/api/v1' });
  await fastify.register(governanceRoutes, { prefix: '/api/v1' });
  await fastify.register(platformAdminRoutes, { prefix: '/api/v1' });
  await fastify.register(apiGatewayRoutes, { prefix: '/api/v1' });
  await fastify.register(integrationRoutes, { prefix: '/api/v1' });
  await fastify.register(graphRoutes, { prefix: '/api/v1' });
  await fastify.register(cooRoutes, { prefix: '/api/v1' });
  await fastify.register(orgMemoryRoutes, { prefix: '/api/v1' });
  await fastify.register(solutionPackRoutes, { prefix: '/api/v1' });
  await fastify.register(partnerRoutes, { prefix: '/api/v1' });
  await fastify.register(economyRoutes, { prefix: '/api/v1' });
  await fastify.register(predictiveRoutes, { prefix: '/api/v1' });
  await fastify.register(riskIntelligenceRoutes, { prefix: '/api/v1' });
  await fastify.register(intelligenceNetworkRoutes, { prefix: '/api/v1' });
  await fastify.register(benchmarkingRoutes, { prefix: '/api/v1' });
  await fastify.register(conversationRoutes, { prefix: '/api/v1' });
  await fastify.register(autonomousIntelligenceRoutes, { prefix: '/api/v1' });
  await fastify.register(digitalTwinRoutes, { prefix: '/api/v1' });
  await fastify.register(policyEngineRoutes, { prefix: '/api/v1' });
  await fastify.register(orgDnaRoutes, { prefix: '/api/v1' });
  await fastify.register(orgHealthRoutes, { prefix: '/api/v1' });
  await fastify.register(workflowGeneratorRoutes, { prefix: '/api/v1' });
  await fastify.register(selfHealingRoutes, { prefix: '/api/v1' });
  await fastify.register(aiDeploymentRoutes, { prefix: '/api/v1' });
  await fastify.register(missionControlRoutes, { prefix: '/api/v1' });
  await fastify.register(reliabilityRoutes, { prefix: '/api/v1' });
  await fastify.register(platformRoutes, { prefix: '/api/v1' });
  await fastify.register(platformAdminV2Routes, { prefix: '/api/v1' });
  await fastify.register(billingV2Routes, { prefix: '/api/v1' });
  await fastify.register(loopRoutes, { prefix: '/api/v1' });
  await fastify.register(broadcastRoutes, { prefix: '/api/v1' });
  await fastify.register(onboardingRoutes, { prefix: '/api/v1' });
  await fastify.register(authRoutes, { prefix: '/api/v1' });
  await fastify.register(eventsSseRoutes, { prefix: '/api/v1' });
  await fastify.register(eventsWsRoutes, { prefix: '/api/v1' });
  await fastify.register(frontendCompatRoutes, { prefix: '/api/v1' });
  await fastify.register(executiveRoutes, { prefix: '/api/v1' });
  await fastify.register(workflowGenRoutes, { prefix: '/api/v1' });
  await fastify.register(approvalRoutes, { prefix: '/api/v1' });
  await fastify.register(wrfRoutes, { prefix: '/api/v1' });
  await fastify.register(aofRoutes, { prefix: '/api/v1' });

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
