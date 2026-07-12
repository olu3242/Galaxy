/**
 * Unified Authorization Pipeline
 *
 * All permission checks route through this middleware:
 *   Identity → Organization OS (AuthorizationEngine) → Policy Engine → Runtime OS
 *
 * This replaces direct RBAC/ABAC queries scattered across routes and services.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthorizationEngine } from '@galaxy/organization';
import type {
  AuthorizationRequest,
  AbacAttributes,
  AuthorizationResult,
} from '@galaxy/organization';

export type AuthResource =
  | 'workflow'
  | 'member'
  | 'department'
  | 'team'
  | 'broadcast'
  | 'knowledge'
  | 'loop'
  | 'analytics'
  | 'audit'
  | 'agent'
  | 'organization'
  | 'approval'
  | 'delegation'
  | 'policy'
  | 'billing'
  | 'developer'
  | 'governance'
  | 'platform';

export type AuthAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'approve'
  | 'escalate'
  | 'admin'
  | 'trigger'
  | 'delegate'
  | 'audit';

export interface AuthContext {
  organizationId: string;
  actorId: string;
  actorType?: AuthorizationRequest['actorType'];
  resource: AuthResource;
  action: AuthAction;
  resourceId?: string;
  correlationId: string;
  attributes?: AbacAttributes;
}

export function registerAuthorizationPlugin(fastify: FastifyInstance): void {
  const engine = new AuthorizationEngine(fastify.pg);

  fastify.decorate('authorize', async (ctx: AuthContext) => {
    const request: AuthorizationRequest = {
      organizationId: ctx.organizationId,
      actorId: ctx.actorId,
      actorType: ctx.actorType ?? 'member',
      resource: ctx.resource,
      action: ctx.action,
      correlationId: ctx.correlationId,
    };
    if (ctx.resourceId !== undefined) request.resourceId = ctx.resourceId;
    if (ctx.attributes !== undefined) request.attributes = ctx.attributes;
    return engine.evaluate(request);
  });

  fastify.decorate('assertAuthorized', async (ctx: AuthContext, reply: FastifyReply) => {
    const result = await fastify.authorize(ctx);
    if (!result.allowed) {
      await reply.status(403).send({
        error: 'Forbidden',
        reason: result.reason,
        requiresApproval: result.requiresApproval,
        approvalTier: result.approvalTier,
      });
    }
    return result;
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authorize: (ctx: AuthContext) => Promise<AuthorizationResult>;
    assertAuthorized: (ctx: AuthContext, reply: FastifyReply) => Promise<AuthorizationResult>;
  }
}

/**
 * Route-level preHandler guard. Resolves actor identity from the JWT and
 * delegates to the AuthorizationEngine.
 */
export function authorizationGuard(
  resource: AuthResource,
  action: AuthAction,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as { sub?: string; id?: string; organizationId?: string } | undefined;
    const actorId = user?.sub ?? user?.id;
    const organizationId = user?.organizationId;

    if (!actorId || !organizationId) {
      await reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    const correlationId =
      (request as unknown as { correlationId: string | undefined }).correlationId ??
      crypto.randomUUID();

    const result = await request.server.authorize({
      organizationId,
      actorId,
      resource,
      action,
      correlationId,
    });

    if (!result.allowed) {
      await reply.status(403).send({
        error: 'Forbidden',
        reason: result.reason,
        requiresApproval: result.requiresApproval,
        approvalTier: result.approvalTier,
      });
    }
  };
}
