import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  LoopInstanceService,
  LoopVerificationService,
  LoopFeedbackService,
  LoopLearningService,
  LoopOptimizationService,
} from '@galaxy/loop';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

function envelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export async function loopRoutes(fastify: FastifyInstance): Promise<void> {
  const instanceSvc = new LoopInstanceService(fastify.pg);
  const verifySvc = new LoopVerificationService(fastify.pg);
  const feedbackSvc = new LoopFeedbackService(fastify.pg);
  const learningSvc = new LoopLearningService(fastify.pg);
  const optimizationSvc = new LoopOptimizationService(fastify.pg);

  // ── Loop instances ──────────────────────────────────────────────────────────

  fastify.post(
    '/loops',
    async (
      request: FastifyRequest<{
        Body: {
          organizationId: string;
          workflowInstanceId: string;
          verificationDeadlineHours?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, workflowInstanceId, verificationDeadlineHours } = request.body;
      if (!organizationId || !workflowInstanceId) {
        return reply.status(400).send({ error: 'organizationId and workflowInstanceId required' });
      }
      const loop = await instanceSvc.create({
        organizationId,
        workflowInstanceId,
        ...(verificationDeadlineHours !== undefined ? { verificationDeadlineHours } : {}),
      });
      return reply.status(201).send(envelope(loop, request.id));
    },
  );

  fastify.get(
    '/loops',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; workflowInstanceId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, workflowInstanceId } = request.query;
      if (!organizationId || !workflowInstanceId) {
        return reply.status(400).send({ error: 'organizationId and workflowInstanceId required' });
      }
      const loops = await instanceSvc.listByWorkflow(workflowInstanceId, organizationId);
      return reply.send(envelope(loops, request.id));
    },
  );

  fastify.get(
    '/loops/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const loop = await instanceSvc.getById(id, organizationId);
      if (!loop) return reply.status(404).send({ error: 'Loop instance not found' });
      return reply.send(envelope(loop, request.id));
    },
  );

  fastify.post(
    '/loops/:id/start-verification',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const loop = await instanceSvc.startVerification(id, organizationId);
      return reply.send(envelope(loop, request.id));
    },
  );

  fastify.post(
    '/loops/:id/complete',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const loop = await instanceSvc.complete(id, organizationId);
      return reply.send(envelope(loop, request.id));
    },
  );

  fastify.post(
    '/loops/:id/escalate',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string; reason: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId, reason } = request.body;
      if (!organizationId || reason === '') {
        return reply.status(400).send({ error: 'organizationId and reason required' });
      }
      const loop = await instanceSvc.escalate(id, organizationId, reason);
      return reply.send(envelope(loop, request.id));
    },
  );

  // ── Verifications ───────────────────────────────────────────────────────────

  fastify.post(
    '/loops/:id/verifications',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          organizationId: string;
          verifiedBy: string;
          status: 'confirmed' | 'rejected';
          notes?: string;
          evidenceUrls?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId, verifiedBy, status, notes, evidenceUrls } = request.body;
      if (!organizationId || !verifiedBy) {
        return reply.status(400).send({ error: 'organizationId, verifiedBy, status required' });
      }
      const verification = await verifySvc.submit(
        {
          loopInstanceId: id,
          verifiedBy,
          status,
          ...(notes !== undefined ? { notes } : {}),
          ...(evidenceUrls !== undefined ? { evidenceUrls } : {}),
        },
        organizationId,
      );
      return reply.status(201).send(envelope(verification, request.id));
    },
  );

  fastify.get(
    '/loops/:id/verifications',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const verifications = await verifySvc.listByLoop(id, organizationId);
      return reply.send(envelope(verifications, request.id));
    },
  );

  // ── Feedback ────────────────────────────────────────────────────────────────

  fastify.post(
    '/loops/:id/feedback',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { organizationId: string; submittedBy: string; score: number; comment?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId, submittedBy, score, comment } = request.body;
      if (!organizationId || !submittedBy) {
        return reply.status(400).send({ error: 'organizationId, submittedBy, score required' });
      }
      const feedback = await feedbackSvc.submit(
        { loopInstanceId: id, submittedBy, score, ...(comment !== undefined ? { comment } : {}) },
        organizationId,
      );
      return reply.status(201).send(envelope(feedback, request.id));
    },
  );

  fastify.get(
    '/loops/:id/feedback',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const feedbackList = await feedbackSvc.listByLoop(id, organizationId);
      return reply.send(envelope(feedbackList, request.id));
    },
  );

  // ── Loop Learning — trigger insight generation ──────────────────────────────

  fastify.post(
    '/loops/learning/analyze',
    async (
      request: FastifyRequest<{
        Body: { organizationId: string; workflowTemplateId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, workflowTemplateId } = request.body;
      if (!organizationId || !workflowTemplateId) {
        return reply.status(400).send({ error: 'organizationId and workflowTemplateId required' });
      }

      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });
      const learningQueue = new Queue('loop-learning', { connection: redis });

      try {
        await learningQueue.add('analyze', { organizationId, workflowTemplateId });
        return await reply
          .status(202)
          .send(envelope({ queued: true, workflowTemplateId }, request.id));
      } finally {
        await learningQueue.close();
        await redis.quit();
      }
    },
  );

  // ── Loop Learning — get insights for a template ─────────────────────────────

  fastify.get(
    '/loops/learning/insights',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; workflowTemplateId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, workflowTemplateId } = request.query;
      if (!organizationId || !workflowTemplateId) {
        return reply.status(400).send({ error: 'organizationId and workflowTemplateId required' });
      }

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const result = await fastify.pg.query<{
        id: string;
        summary: string;
        recommendations: string[];
        optimization_score: number;
        priority: string;
        metrics_snapshot: Record<string, unknown>;
        period_days: number;
        updated_at: string;
      }>(
        `SELECT * FROM loop_learning_insights
         WHERE organization_id = $1 AND workflow_template_id = $2`,
        [organizationId, workflowTemplateId],
      );

      const insight = result.rows[0] ?? null;
      return reply.send(envelope(insight, request.id));
    },
  );

  // ── Learning Phase — pattern analysis and insight generation ─────────────────

  fastify.post(
    '/loops/learning/generate-insights',
    async (request: FastifyRequest<{ Body: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const insights = await learningSvc.generateInsights(organizationId);
      return reply.status(201).send(envelope({ insights, count: insights.length }, request.id));
    },
  );

  fastify.get(
    '/loops/learning/phase-insights',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, limit } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const insights = await learningSvc.listInsights(
        organizationId,
        limit ? parseInt(limit, 10) : undefined,
      );
      return reply.send(envelope(insights, request.id));
    },
  );

  fastify.get(
    '/loops/learning/patterns',
    async (
      request: FastifyRequest<{ Querystring: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { organizationId } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const patterns = await learningSvc.analyzePatterns(organizationId);
      return reply.send(envelope(patterns, request.id));
    },
  );

  // ── Optimization Phase — recommendations ─────────────────────────────────────

  fastify.post(
    '/loops/optimization/generate',
    async (request: FastifyRequest<{ Body: { organizationId: string } }>, reply: FastifyReply) => {
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const recommendations = await optimizationSvc.generateRecommendations(organizationId);
      return reply
        .status(201)
        .send(envelope({ recommendations, count: recommendations.length }, request.id));
    },
  );

  fastify.get(
    '/loops/optimization/recommendations',
    async (
      request: FastifyRequest<{
        Querystring: { organizationId: string; status?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, status } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const validStatuses = ['pending', 'applied', 'dismissed'] as const;
      type ValidStatus = (typeof validStatuses)[number];
      const typedStatus = validStatuses.includes(status as ValidStatus)
        ? (status as ValidStatus)
        : undefined;
      const recs = await optimizationSvc.listRecommendations(organizationId, typedStatus);
      return reply.send(envelope(recs, request.id));
    },
  );

  fastify.post(
    '/loops/optimization/recommendations/:id/apply',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const rec = await optimizationSvc.applyRecommendation(organizationId, id);
      if (!rec) return reply.status(404).send({ error: 'Recommendation not found' });
      return reply.send(envelope(rec, request.id));
    },
  );

  fastify.post(
    '/loops/optimization/recommendations/:id/dismiss',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { organizationId } = request.body;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });
      const rec = await optimizationSvc.dismissRecommendation(organizationId, id);
      if (!rec) return reply.status(404).send({ error: 'Recommendation not found' });
      return reply.send(envelope(rec, request.id));
    },
  );

  fastify.get(
    '/loops/all',
    async (
      request: FastifyRequest<{
        Querystring: {
          organizationId: string;
          status?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { organizationId, status, limit, offset } = request.query;
      if (!organizationId) return reply.status(400).send({ error: 'organizationId required' });

      await fastify.pg.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        organizationId,
      ]);

      const lim = limit ? parseInt(limit, 10) : 20;
      const off = offset ? parseInt(offset, 10) : 0;

      const conditions = ['organization_id = $1'];
      const params: unknown[] = [organizationId];

      if (status) {
        params.push(status);
        conditions.push(`status = $${String(params.length)}`);
      }

      const whereClause = conditions.join(' AND ');

      const [rows, countResult] = await Promise.all([
        fastify.pg.query<{
          id: string;
          workflow_instance_id: string;
          status: string;
          phase: string | null;
          created_at: string;
          updated_at: string;
          verification_deadline: string | null;
          feedback_score: number | null;
        }>(
          `SELECT id, workflow_instance_id, status, phase, created_at, updated_at,
                  verification_deadline, feedback_score
           FROM loop_instances
           WHERE ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
          [...params, lim, off],
        ),
        fastify.pg.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM loop_instances WHERE ${whereClause}`,
          params,
        ),
      ]);

      return reply.send({
        data: rows.rows.map((r) => ({
          id: r.id,
          workflowInstanceId: r.workflow_instance_id,
          status: r.status,
          phase: r.phase,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          verificationDeadline: r.verification_deadline,
          feedbackScore: r.feedback_score,
        })),
        meta: { total: parseInt(countResult.rows[0]?.count ?? '0', 10) },
      });
    },
  );
}
