import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { type Pool } from 'pg';
import { WorkstreamRuntimeService, DependencyHealthService } from '@galaxy/platform';

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
 * Galaxy Workstream Reliability Framework — Mission Control API
 *
 * All routes are admin-only (x-admin-secret header).
 * These endpoints power the /admin/runtime/workstreams Mission Control dashboard.
 */
export async function wrfRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new WorkstreamRuntimeService(fastify.pg);

  // ── GET /admin/runtime/workstreams ────────────────────────────────────────
  // Active workstream executions: running, waiting, degraded, failed
  fastify.get(
    '/admin/runtime/workstreams',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;

      const query = request.query as {
        state?: string;
        limit?: string;
        windowMinutes?: string;
      };

      const states = query.state
        ? query.state.split(',')
        : ['queued', 'planning', 'running', 'waiting', 'degraded', 'failed'];

      const limit = Math.min(Number(query.limit ?? 100), 500);

      const [activeRows, metrics] = await Promise.all([
        svc.listActiveWorkstreams({ states: states as never, limit }),
        svc.getLatencyPercentiles(Number(query.windowMinutes ?? 60)),
      ]);

      return reply.send({
        workstreams: {
          active: activeRows.filter((r) =>
            ['queued', 'planning', 'running', 'waiting'].includes(r.execution_state),
          ),
          degraded: activeRows.filter((r) => r.execution_state === 'degraded'),
          failed: activeRows.filter((r) => r.execution_state === 'failed'),
          total: activeRows.length,
        },
        runtime: {
          p50LatencyMs: metrics.p50,
          p95LatencyMs: metrics.p95,
          p99LatencyMs: metrics.p99,
          errorRate: metrics.errorRate,
          throughputPerMinute: metrics.throughputPerMinute,
        },
      });
    },
  );

  // ── GET /admin/runtime/health ─────────────────────────────────────────────
  // Platform-wide dependency health matrix
  fastify.get('/admin/runtime/health', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    const healthSvc = new DependencyHealthService(fastify.pg, process.env.REDIS_URL);

    const matrix = await healthSvc.getHealthMatrix('platform');

    return reply.send(matrix);
  });

  // ── GET /admin/runtime/workstreams/:workstreamId ──────────────────────────
  // Drill-down: telemetry trace for a single workstream execution
  fastify.get(
    '/admin/runtime/workstreams/:workstreamId',
    async (request: FastifyRequest<{ Params: { workstreamId: string } }>, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;

      const { workstreamId } = request.params;

      // Admin reads run without RLS — must use pool.query directly here
      const [checkpointResult, telemetryResult] = await Promise.all([
        fastify.pg.query<Record<string, unknown>>(
          `SELECT * FROM workstream_checkpoints
           WHERE workstream_id = $1
           ORDER BY saved_at DESC
           LIMIT 1`,
          [workstreamId],
        ),
        fastify.pg.query<Record<string, unknown>>(
          `SELECT * FROM workstream_telemetry
           WHERE workstream_id = $1
           ORDER BY recorded_at ASC`,
          [workstreamId],
        ),
      ]);

      if (checkpointResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Workstream not found' });
      }

      return reply.send({
        checkpoint: checkpointResult.rows[0] ?? null,
        telemetry: telemetryResult.rows,
        stageCount: telemetryResult.rows.length,
        totalDurationMs: telemetryResult.rows.reduce(
          (acc: number, r: Record<string, unknown>) => acc + Number(r.duration_ms ?? 0),
          0,
        ),
      });
    },
  );

  // ── GET /admin/runtime/intelligence ──────────────────────────────────────
  // Full Runtime Intelligence API response (powers Mission Control summary)
  fastify.get(
    '/admin/runtime/intelligence',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;

      const query = request.query as { windowMinutes?: string };
      const windowMinutes = Number(query.windowMinutes ?? 60);

      const healthSvc = new DependencyHealthService(fastify.pg, process.env.REDIS_URL);

      const [activeRows, metrics, dependencyMatrix] = await Promise.all([
        svc.listActiveWorkstreams({ limit: 200 }),
        svc.getLatencyPercentiles(windowMinutes),
        healthSvc.getHealthMatrix('platform'),
      ]);

      // Agent utilization from autonomous_agents table
      const agentResult = await fastify.pg.query<{
        total: string;
        busy: string;
        idle: string;
        failed_count: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'active') AS busy,
           COUNT(*) FILTER (WHERE status = 'idle') AS idle,
           COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
         FROM autonomous_agents`,
      );

      const agentRow = agentResult.rows[0];

      // Knowledge OS retrieval stats
      const knowledgeResult = await fastify.pg.query<{
        success_rate: string;
        avg_latency: string;
      }>(
        `SELECT
           AVG(CASE WHEN success THEN 1 ELSE 0 END) AS success_rate,
           AVG(duration_ms) AS avg_latency
         FROM workstream_telemetry
         WHERE stage = 'knowledge_retrieval'
           AND recorded_at > NOW() - ($1 || ' minutes')::INTERVAL`,
        [windowMinutes],
      );

      const knowledgeRow = knowledgeResult.rows[0];

      return reply.send({
        workstreams: {
          active: activeRows
            .filter((r) => ['queued', 'planning', 'running', 'waiting'].includes(r.execution_state))
            .slice(0, 20),
          waiting: activeRows.filter((r) => r.execution_state === 'waiting').slice(0, 20),
          failed: activeRows.filter((r) => r.execution_state === 'failed').slice(0, 20),
          recentlyCompleted: [],
        },
        agents: {
          total: Number(agentRow?.total ?? 0),
          busy: Number(agentRow?.busy ?? 0),
          idle: Number(agentRow?.idle ?? 0),
          failed: Number(agentRow?.failed_count ?? 0),
        },
        dependencies: dependencyMatrix,
        runtime: {
          p50LatencyMs: metrics.p50,
          p95LatencyMs: metrics.p95,
          p99LatencyMs: metrics.p99,
          errorRate: metrics.errorRate,
          throughputPerMinute: metrics.throughputPerMinute,
        },
        queues: {},
        knowledge: {
          retrievalSuccessRate: Number(knowledgeRow?.success_rate ?? 1),
          avgLatencyMs: Number(knowledgeRow?.avg_latency ?? 0),
        },
        memory: {
          utilizationPercent: 0,
        },
        health: dependencyMatrix.overall,
      });
    },
  );

  // ── GET /admin/runtime/health-matrix ─────────────────────────────────────
  // Workstream Health Matrix for release gate certification
  fastify.get(
    '/admin/runtime/health-matrix',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;

      const query = request.query as { windowMinutes?: string };
      const windowMinutes = Number(query.windowMinutes ?? 60);

      const healthSvc = new DependencyHealthService(fastify.pg, process.env.REDIS_URL);
      const [dependencyMatrix, metrics] = await Promise.all([
        healthSvc.getHealthMatrix('platform'),
        svc.getLatencyPercentiles(windowMinutes),
      ]);

      // Compute per-stage health from telemetry
      const stageHealthResult = await fastify.pg.query<{
        stage: string;
        success_rate: string;
        avg_latency: string;
        error_count: string;
      }>(
        `SELECT
           stage,
           AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) AS success_rate,
           AVG(duration_ms) AS avg_latency,
           COUNT(*) FILTER (WHERE NOT success) AS error_count
         FROM workstream_telemetry
         WHERE recorded_at > NOW() - ($1 || ' minutes')::INTERVAL
         GROUP BY stage
         ORDER BY stage`,
        [windowMinutes],
      );

      const releaseGatePassed =
        dependencyMatrix.overall !== 'unavailable' &&
        metrics.errorRate < 0.05 &&
        stageHealthResult.rows.every((r) => Number(r.success_rate) >= 0.95);

      return reply.send({
        generatedAt: new Date().toISOString(),
        windowMinutes,
        dependencies: dependencyMatrix,
        runtime: {
          p50LatencyMs: metrics.p50,
          p95LatencyMs: metrics.p95,
          p99LatencyMs: metrics.p99,
          errorRate: metrics.errorRate,
          throughputPerMinute: metrics.throughputPerMinute,
        },
        stages: stageHealthResult.rows,
        releaseGate: {
          passed: releaseGatePassed,
          blockers: [
            ...(dependencyMatrix.overall === 'unavailable'
              ? ['Critical dependency unavailable']
              : []),
            ...(metrics.errorRate >= 0.05
              ? [`Error rate ${(metrics.errorRate * 100).toFixed(1)}% exceeds 5% threshold`]
              : []),
            ...stageHealthResult.rows
              .filter((r) => Number(r.success_rate) < 0.95)
              .map(
                (r) =>
                  `Stage "${r.stage}" success rate ${(Number(r.success_rate) * 100).toFixed(1)}% below 95% threshold`,
              ),
          ],
        },
      });
    },
  );
}
