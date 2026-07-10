import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';

export interface JwtUser {
  sub: string;
  organizationId: string;
  role: string;
  iat: number;
  exp: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtUser;
  }
}

const PUBLIC_PATHS = new Set(['/health', '/api/v1/webhooks/whatsapp']);

export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

  await fastify.register(fastifyJwt, { secret: jwtSecret });

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (PUBLIC_PATHS.has(request.routeOptions.url ?? request.url)) return;
    try {
      await request.jwtVerify<JwtUser>();
    } catch {
      await reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
