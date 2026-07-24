import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import {
  OptimizationEngineService,
  DecisionEngineService,
  PredictiveIntelligenceService,
  AutonomousCertificationService,
} from '@galaxy/platform';
import { withTenantClient } from '../lib/withTenantClient.js';
import type { CertificationChecklist, RollbackPlan } from '@galaxy/types';

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool;
  }
}

const ADMIN_SECRET = process.env.PLATFORM_ADMIN_SECRET ?? '';

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const provided = request.headers['x-admin-secret'];
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    void reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

/**
 * Galaxy Autonomous Operations Framework — Enterprise Optimization API
 *
 * All routes are admin-only (x-admin-secret header).
 * These endpoints power the AOF layer above Mission Control.
 */
export async function aofRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/optimization ───────────────────────────────────────
  // Main Enterprise Optimization endpoint — recommendations, predictions, score
  fastify.get(
    '/api/v1/admin/optimization',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;

      const query = request.query as {
        organizationId?: string;
        windowMinutes?: string;
      };

      if (!query.organizationId) {
        return reply.status(400).send({ error: 'organizationId query param required' });
      }

      const windowMinutes = Number(query.windowMinutes ?? 60);
      const organizationId = query.organizationId;

      const optimizationSvc = new OptimizationEngineService(fastify.pg);
      const predictionSvc = new PredictiveIntelligenceService(fastify.pg);

      const [recommendations, forecast] = await Promise.all([
        optimizationSvc.generateRecommendations(windowMinutes),
        predictionSvc.forecastLoad(windowMinutes),
      ]);

      const predictions = await withTenantClient(fastify.pg, organizationId, async (client) =>
        predictionSvc.getLatestPredictions(client, organizationId, { limit: 5 }),
      );

      const agentResult = await fastify.pg.query<{
        total: string;
        busy: string;
        failed_count: string;
        avg_completion: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'active') AS busy,
           COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
           0 AS avg_completion
         FROM autonomous_agents`,
      );

      const agentRow = agentResult.rows[0];
      const total = Number(agentRow?.total ?? 0);
      const busy = Number(agentRow?.busy ?? 0);

      const optimizationScore = Math.round(
        Math.min(
          100,
          60 +
            recommendations.filter((r) => r.priority === 'Low').length * 5 -
            recommendations.filter((r) => r.priority === 'Critical').length * 15,
        ),
      );

      return reply.send({
        generatedAt: new Date().toISOString(),
        organizationId,
        recommendations,
        predictions,
        optimizationScore,
        costSavings: {
          projectedMonthlySavingsUsd: recommendations.reduce(
            (acc, r) => acc + (r.estimatedSavingsMs ?? 0) * 0.0001,
            0,
          ),
          automationRatePercent: total > 0 ? Math.round((busy / total) * 100) : 0,
          redundantStepsEliminated: recommendations.filter((r) => r.type === 'latency_optimization')
            .length,
        },
        workflowImprovements: [],
        agentPerformance: {
          totalAgents: total,
          utilizationPercent: total > 0 ? Math.round((busy / total) * 100) : 0,
          avgTaskCompletionMs: Number(agentRow?.avg_completion ?? 0),
          failureRatePercent:
            total > 0 ? Math.round((Number(agentRow?.failed_count ?? 0) / total) * 100) : 0,
        },
        forecast,
      });
    },
  );

  // ── POST /api/v1/admin/aof/decision/evaluate ──────────────────────────────
  fastify.post(
    '/api/v1/admin/aof/decision/evaluate',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          candidate: {
            description: string;
            estimatedImpact: Record<string, unknown>;
            targetWorkflowId?: string;
          };
        };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;

      const { organizationId, candidate } = request.body;
      if (!organizationId || !candidate.description) {
        return reply
          .status(400)
          .send({ error: 'organizationId and candidate.description required' });
      }

      const svc = new DecisionEngineService(fastify.pg);
      const decision = await withTenantClient(fastify.pg, organizationId, (client) =>
        svc.evaluate(client, { organizationId, candidate }),
      );

      return reply.send(decision);
    },
  );

  // ── GET /api/v1/admin/aof/decisions ──────────────────────────────────────
  fastify.get(
    '/api/v1/admin/aof/decisions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;

      const query = request.query as { organizationId?: string; limit?: string };
      if (!query.organizationId) {
        return reply.status(400).send({ error: 'organizationId query param required' });
      }

      const svc = new DecisionEngineService(fastify.pg);
      const orgId = query.organizationId;
      const decisions = await withTenantClient(fastify.pg, orgId, (client) =>
        svc.listDecisions(client, orgId, {
          limit: Number(query.limit ?? 50),
        }),
      );

      return reply.send({ decisions });
    },
  );

  // ── POST /api/v1/admin/aof/certifications ─────────────────────────────────
  fastify.post(
    '/api/v1/admin/aof/certifications',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          optimizationId: string;
          checklist: CertificationChecklist;
          rollbackPlan: RollbackPlan;
        };
      }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;

      const { organizationId, optimizationId, checklist, rollbackPlan } = request.body;
      if (!organizationId || !optimizationId) {
        return reply.status(400).send({ error: 'organizationId and optimizationId required' });
      }

      const svc = new AutonomousCertificationService(fastify.pg);
      const cert = await withTenantClient(fastify.pg, organizationId, (client) =>
        svc.submit(client, { organizationId, optimizationId, checklist, rollbackPlan }),
      );

      return reply.status(201).send(cert);
    },
  );

  // ── GET /api/v1/admin/aof/certifications/:id ──────────────────────────────
  fastify.get(
    '/api/v1/admin/aof/certifications/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId?: string } }>,
      reply: FastifyReply,
    ) => {
      if (!requireAdmin(request, reply)) return;

      const { id } = request.params;
      const organizationId = request.query.organizationId;
      if (!organizationId) {
        return reply.status(400).send({ error: 'organizationId query param required' });
      }

      const svc = new AutonomousCertificationService(fastify.pg);
      const cert = await withTenantClient(fastify.pg, organizationId, (client) =>
        svc.get(client, id),
      );

      if (!cert) return reply.status(404).send({ error: 'Certification not found' });
      return reply.send(cert);
    },
  );
}
