import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ConversationSessionService,
  ConversationMessageService,
  type ChannelType,
  type SessionStatus,
  type MessageDirection,
} from '@galaxy/conversation';

export function conversationRoutes(fastify: FastifyInstance): void {
  // POST /conversation/sessions
  fastify.post(
    '/conversation/sessions',
    async (
      request: FastifyRequest<{
        Body: { channelType: string; externalId: string; participantId: string; orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { channelType, externalId, participantId, orgId } = request.body;
      const svc = new ConversationSessionService(fastify.pg);
      const session = await svc.createSession(
        orgId,
        channelType as ChannelType,
        externalId,
        participantId,
      );
      return reply.status(201).send(session);
    },
  );

  // GET /conversation/sessions
  fastify.get(
    '/conversation/sessions',
    async (
      request: FastifyRequest<{
        Querystring: { orgId: string; status?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { orgId, status, limit } = request.query;
      const svc = new ConversationSessionService(fastify.pg);
      const sessions = await svc.listSessions(
        orgId,
        status as SessionStatus | undefined,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send(sessions);
    },
  );

  // GET /conversation/sessions/:sessionId
  fastify.get(
    '/conversation/sessions/:sessionId',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Querystring: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { orgId } = request.query;
      const svc = new ConversationSessionService(fastify.pg);
      const session = await svc.getSession(orgId, sessionId);
      return reply.send(session);
    },
  );

  // PATCH /conversation/sessions/:sessionId/status
  fastify.patch(
    '/conversation/sessions/:sessionId/status',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { orgId: string; status: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { orgId, status } = request.body;
      const svc = new ConversationSessionService(fastify.pg);
      const session = await svc.updateSessionStatus(orgId, sessionId, status as SessionStatus);
      return reply.send(session);
    },
  );

  // POST /conversation/sessions/:sessionId/close
  fastify.post(
    '/conversation/sessions/:sessionId/close',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: { orgId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { orgId } = request.body;
      const svc = new ConversationSessionService(fastify.pg);
      const session = await svc.closeSession(orgId, sessionId);
      return reply.send(session);
    },
  );

  // POST /conversation/sessions/:sessionId/messages
  fastify.post(
    '/conversation/sessions/:sessionId/messages',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Body: {
          orgId: string;
          direction: string;
          content: string;
          rawPayload?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { orgId, direction, content, rawPayload } = request.body;
      const svc = new ConversationMessageService(fastify.pg);
      const message = await svc.ingestMessage(
        orgId,
        sessionId,
        direction as MessageDirection,
        content,
        rawPayload ?? {},
      );
      return reply.status(201).send(message);
    },
  );

  // GET /conversation/sessions/:sessionId/messages
  fastify.get(
    '/conversation/sessions/:sessionId/messages',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Querystring: { orgId: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { orgId, limit } = request.query;
      const svc = new ConversationMessageService(fastify.pg);
      const messages = await svc.getMessages(
        orgId,
        sessionId,
        limit !== undefined ? parseInt(limit, 10) : undefined,
      );
      return reply.send(messages);
    },
  );
}
