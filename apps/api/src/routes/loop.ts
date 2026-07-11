import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LoopInstanceService, LoopVerificationService, LoopFeedbackService } from '@galaxy/loop';

function envelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export function loopRoutes(fastify: FastifyInstance): void {
  const instanceSvc = new LoopInstanceService(fastify.pg);
  const verifySvc = new LoopVerificationService(fastify.pg);
  const feedbackSvc = new LoopFeedbackService(fastify.pg);

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
        verificationDeadlineHours,
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
        { loopInstanceId: id, verifiedBy, status, notes, evidenceUrls },
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
        { loopInstanceId: id, submittedBy, score, comment },
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
}
