import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';

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

function extractBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function decodeJwtIssuer(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { iss?: unknown };
    return typeof parsed.iss === 'string' ? parsed.iss : null;
  } catch {
    return null;
  }
}

export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

  await fastify.register(fastifyJwt, { secret: jwtSecret });

  // Auth0 config — optional; when set, tokens issued by AUTH0_DOMAIN are validated
  // against Auth0's JWKS endpoint rather than the local JWT_SECRET.
  const auth0Domain = process.env.AUTH0_DOMAIN;
  const auth0Audience = process.env.AUTH0_AUDIENCE;

  let auth0Jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  if (auth0Domain) {
    const jwksUrl = new URL(`https://${auth0Domain}/.well-known/jwks.json`);
    auth0Jwks = createRemoteJWKSet(jwksUrl);
  }

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (PUBLIC_PATHS.has(request.routeOptions.url ?? request.url)) return;

    const token = extractBearerToken(request);
    if (!token) {
      await reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    // Route Auth0 tokens to JWKS verification; local tokens to @fastify/jwt
    if (auth0Jwks && auth0Domain) {
      const issuer = decodeJwtIssuer(token);
      const isAuth0Token =
        issuer === `https://${auth0Domain}/` || issuer === `https://${auth0Domain}`;

      if (isAuth0Token) {
        try {
          const { payload } = await jwtVerify(token, auth0Jwks, {
            issuer: [`https://${auth0Domain}/`, `https://${auth0Domain}`],
            ...(auth0Audience ? { audience: auth0Audience } : {}),
          });

          // Map Auth0 claims to Galaxy's JwtUser shape.
          // Auth0 custom claims carry organizationId and role via rules/actions.
          const namespaced = payload as Record<string, unknown>;
          const organizationId =
            typeof namespaced['https://galaxy.app/organizationId'] === 'string'
              ? namespaced['https://galaxy.app/organizationId']
              : typeof payload.organizationId === 'string'
                ? payload.organizationId
                : '';

          const role =
            typeof namespaced['https://galaxy.app/role'] === 'string'
              ? namespaced['https://galaxy.app/role']
              : typeof payload.role === 'string'
                ? payload.role
                : 'member';

          request.user = {
            sub: typeof payload.sub === 'string' ? payload.sub : '',
            organizationId,
            role,
            iat: typeof payload.iat === 'number' ? payload.iat : 0,
            exp: typeof payload.exp === 'number' ? payload.exp : 0,
          } satisfies JwtUser;
          return;
        } catch {
          await reply.status(401).send({ error: 'Unauthorized' });
          return;
        }
      }
    }

    // Fall through to local JWT verification
    try {
      await request.jwtVerify<JwtUser>();
    } catch {
      await reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
