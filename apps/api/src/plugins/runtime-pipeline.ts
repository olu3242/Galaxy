import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { EventPublisher } from '@galaxy/events';
import { AuditRepository } from '@galaxy/identity';

// Paths that do not require the runtime pipeline (public + webhook)
const PIPELINE_SKIP_PATHS = new Set(['/health', '/api/v1/webhooks/whatsapp']);

// HTTP methods that represent state mutations — these get event + audit treatment
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

/**
 * registerRuntimePipeline
 *
 * Wires the Galaxy Runtime Engine lifecycle into every API request:
 *
 *   onRequest  — generates / propagates correlationId
 *   onResponse — for mutating requests: publishes a GalaxyEvent + writes audit_log
 *
 * This plugin runs AFTER auth and tenant middleware so that request.user
 * and the RLS tenant context are already established.
 *
 * The event type is derived from the route path:
 *   POST /api/v1/workflows  →  api.post.workflows
 *   DELETE /api/v1/members  →  api.delete.members
 */
export function registerRuntimePipeline(fastify: FastifyInstance, pool: Pool): void {
  const publisher = new EventPublisher(pool);
  const auditRepo = new AuditRepository(pool);

  // Stage 1: Thread correlationId through the request
  fastify.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done) => {
    const fromHeader = request.headers['x-correlation-id'];
    request.correlationId =
      typeof fromHeader === 'string' && fromHeader.length > 0 ? fromHeader : crypto.randomUUID();
    done();
  });

  // Stage 2: After response — emit event + audit for mutating requests
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (PIPELINE_SKIP_PATHS.has(request.url)) return;
    if (!MUTATING_METHODS.has(request.method)) return;
    // Only record successful mutations (2xx)
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;

    // request.user is typed as JwtUser (non-optional) by @fastify/jwt, but may be absent
    // on routes that skip auth — cast to unknown to inspect safely
    interface LooseUser {
      organizationId?: string;
      id?: string;
    }
    const rawUser = (request as unknown as { user?: LooseUser }).user;
    const organizationId = rawUser?.organizationId;
    const actorId = rawUser?.id;

    if (!organizationId) return;

    const correlationId = request.correlationId;
    const eventId = crypto.randomUUID();

    // Derive a meaningful event type from method + path segment
    const pathSegment = request.url.replace('/api/v1/', '').split('/')[0] ?? 'resource';
    const eventType = `api.${request.method.toLowerCase()}.${pathSegment}`;

    // Publish GalaxyEvent — non-fatal if event bus is unavailable
    try {
      await publisher.publish({
        id: eventId,
        version: '1.0',
        type: eventType,
        tenantId: organizationId,
        correlationId,
        causationId: correlationId,
        timestamp: new Date().toISOString(),
        actor: { type: actorId ? 'member' : 'system', id: actorId ?? 'system' },
        payload: {
          method: request.method,
          path: request.url,
          statusCode: reply.statusCode,
        },
        metadata: {
          idempotencyKey: eventId,
          schemaVersion: '1.0',
          source: 'galaxy.api',
        },
      });
    } catch (err) {
      request.log.warn({ err, correlationId }, 'runtime-pipeline: event publish failed');
    }

    // Write audit log — non-fatal if insert fails
    try {
      const auditInput: Parameters<typeof auditRepo.insert>[0] = {
        organizationId,
        actorType: 'member',
        action: eventType,
        resourceType: pathSegment,
        correlationId,
        causationId: correlationId,
      };
      if (actorId !== undefined) auditInput.actorId = actorId;
      await auditRepo.insert(auditInput);
    } catch (err) {
      request.log.warn({ err, correlationId }, 'runtime-pipeline: audit log write failed');
    }
  });
}
