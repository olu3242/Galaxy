import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService, EmailPasswordProvider } from '@galaxy/identity';
import type { EmailPasswordCredentials } from '@galaxy/identity';
import { newCorrelationId } from '@galaxy/utils';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

interface MembershipRow {
  organization_id: string;
  role: string;
  status: string;
}

function responseEnvelope<T>(data: T, requestId: string) {
  return { data, meta: { requestId, timestamp: new Date().toISOString() } };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService();
  authService.registerProvider(new EmailPasswordProvider(fastify.pg));

  /**
   * POST /auth/login
   * Exchange email + password for access + refresh tokens.
   * Public — does not require Authorization header.
   */
  fastify.post(
    '/auth/login',
    { config: { skipAuth: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = newCorrelationId();

      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation error',
          details: parsed.error.errors,
          correlationId,
        });
      }

      const { email, password } = parsed.data;

      const credentials: EmailPasswordCredentials = { type: 'email_password', email, password };
      const result = await authService.authenticate(credentials);

      if (!result.success || !result.userId) {
        return reply.status(401).send({ error: 'Invalid credentials', correlationId });
      }

      // Find primary active membership — query directly (not tenant-scoped)
      const membershipResult = await fastify.pg.query<MembershipRow>(
        "SELECT organization_id, role, status FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
        [result.userId],
      );

      const membership = membershipResult.rows[0];
      if (!membership) {
        return reply
          .status(403)
          .send({ error: 'No active organization membership', correlationId });
      }

      const accessToken = fastify.jwt.sign(
        {
          sub: result.userId,
          organizationId: membership.organization_id,
          role: membership.role,
        },
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '24h' },
      );

      const refreshToken = fastify.jwt.sign(
        {
          sub: result.userId,
          organizationId: membership.organization_id,
          type: 'refresh',
        },
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' },
      );

      return reply.send(
        responseEnvelope(
          {
            accessToken,
            refreshToken,
            expiresIn: 86400,
            member: {
              id: result.userId,
              email,
              role: membership.role,
              organizationId: membership.organization_id,
            },
          },
          request.id,
        ),
      );
    },
  );

  /**
   * POST /auth/refresh
   * Exchange a refresh token for a new access token.
   */
  fastify.post(
    '/auth/refresh',
    { config: { skipAuth: true } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = newCorrelationId();

      const parsed = RefreshSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation error', correlationId });
      }

      try {
        const payload = fastify.jwt.verify<{
          sub: string;
          organizationId: string;
          type: string;
        }>(parsed.data.refreshToken);

        if (payload.type !== 'refresh') {
          return await reply.status(401).send({ error: 'Invalid token type', correlationId });
        }

        // Re-fetch current role (may have changed)
        const membershipResult = await fastify.pg.query<MembershipRow>(
          "SELECT role FROM memberships WHERE user_id = $1 AND organization_id = $2 AND status = 'active' LIMIT 1",
          [payload.sub, payload.organizationId],
        );

        const membership = membershipResult.rows[0];
        if (!membership) {
          return await reply.status(401).send({ error: 'Membership not found', correlationId });
        }

        const accessToken = fastify.jwt.sign(
          {
            sub: payload.sub,
            organizationId: payload.organizationId,
            role: membership.role,
          },
          { expiresIn: process.env.JWT_EXPIRES_IN ?? '24h' },
        );

        return await reply.send(responseEnvelope({ accessToken, expiresIn: 86400 }, request.id));
      } catch {
        return reply.status(401).send({ error: 'Invalid or expired refresh token', correlationId });
      }
    },
  );

  /**
   * POST /auth/logout
   * Stateless logout — client discards tokens.
   */
  fastify.post('/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true });
  });

  /**
   * GET /auth/me
   * Returns the current authenticated user's profile.
   */
  fastify.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { sub: string; organizationId: string; role: string };

    const membershipResult = await fastify.pg.query<
      MembershipRow & { email: string; name: string }
    >(
      `SELECT m.organization_id, m.role, m.status, u.email, u.display_name as name
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.user_id = $1 AND m.organization_id = $2 LIMIT 1`,
      [user.sub, user.organizationId],
    );

    const membership = membershipResult.rows[0];
    if (!membership) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return reply.send(
      responseEnvelope(
        {
          id: user.sub,
          name: membership.name,
          email: membership.email,
          role: user.role,
          organizationId: user.organizationId,
        },
        request.id,
      ),
    );
  });
}
