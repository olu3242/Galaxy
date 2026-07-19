import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApprovalRuntimeService } from '@galaxy/workflow';

interface DecideBody {
  decision: 'approved' | 'rejected';
  reason?: string;
}

interface DelegateBody {
  delegateTo: string;
  reason: string;
}

interface ApprovalParams {
  id: string;
}

export async function approvalRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new ApprovalRuntimeService(fastify.pg);

  /**
   * GET /api/v1/approvals
   * List pending approvals for the authenticated user.
   */
  fastify.get(
    '/approvals',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { organizationId, sub: actorId } = request.user;
      const pending = await service.getPending(organizationId, actorId);
      return reply.send({ approvals: pending });
    },
  );

  /**
   * POST /api/v1/approvals/:id/decide
   * Approve or reject an approval request.
   */
  fastify.post<{ Params: ApprovalParams; Body: DecideBody }>(
    '/approvals/:id/decide',
    async (request, reply: FastifyReply) => {
      const { sub: actorId } = request.user;
      const { id: approvalId } = request.params;
      const { decision, reason } = request.body;

      if (decision !== 'approved' && decision !== 'rejected') {
        return reply.status(400).send({ error: 'decision must be "approved" or "rejected"' });
      }

      const updated = await service.decide(approvalId, actorId, decision, reason);
      return reply.send({ approval: updated });
    },
  );

  /**
   * POST /api/v1/approvals/:id/delegate
   * Delegate an approval to another member.
   */
  fastify.post<{ Params: ApprovalParams; Body: DelegateBody }>(
    '/approvals/:id/delegate',
    async (request, reply: FastifyReply) => {
      const { sub: actorId } = request.user;
      const { id: approvalId } = request.params;
      const { delegateTo, reason } = request.body;

      if (!delegateTo || typeof delegateTo !== 'string') {
        return reply.status(400).send({ error: 'delegateTo is required' });
      }
      if (!reason || typeof reason !== 'string') {
        return reply.status(400).send({ error: 'reason is required' });
      }

      const updated = await service.delegate(approvalId, actorId, delegateTo, reason);
      return reply.send({ approval: updated });
    },
  );
}
