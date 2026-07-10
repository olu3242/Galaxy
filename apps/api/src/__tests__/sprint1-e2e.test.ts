/**
 * Sprint 1 E2E — WhatsApp Webhook → Intent Detection → Workflow Enqueue
 *
 * Tests the full inbound message path without a real database or Redis.
 * BullMQ Queue and pg Pool are mocked; the test drives the HTTP layer.
 */

import crypto from 'crypto';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

// ── Mock BullMQ ───────────────────────────────────────────────────────────────

const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: mockAdd, close: mockClose })),
}));

// ── Mock ioredis ──────────────────────────────────────────────────────────────

const mockQuit = vi.fn().mockResolvedValue('OK');

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ quit: mockQuit })),
}));

// ── Mock pg Pool ──────────────────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
const mockPool = { query: mockQuery, end: vi.fn().mockResolvedValue(undefined) } as unknown as Pool;

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => mockPool),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const APP_SECRET = 'test-whatsapp-app-secret';
const JWT_SECRET = 'test-jwt-secret';
const VERIFY_TOKEN = 'test-verify-token';

function sign(body: string): string {
  return `sha256=${crypto.createHmac('sha256', APP_SECRET).update(Buffer.from(body)).digest('hex')}`;
}

function makeTextMessage(overrides?: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: 'phone-123' },
              contacts: [{ wa_id: '2348012345678', profile: { name: 'Test User' } }],
              messages: [
                {
                  id: 'wamid.test.001',
                  from: '2348012345678',
                  timestamp: '1717977600',
                  type: 'text',
                  text: { body: 'Submit monthly report' },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// ── Build test app ────────────────────────────────────────────────────────────

async function buildTestApp(): Promise<FastifyInstance> {
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';

  const { registerAuth } = await import('../middleware/auth.js');
  const { registerTenantContext } = await import('../middleware/tenant.js');
  const { whatsappWebhookRoutes } = await import('../routes/webhooks-whatsapp.js');

  const fastify = Fastify({ logger: false });

  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as typeof req & { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString()) as unknown);
    } catch (err) {
      done(err as Error);
    }
  });

  fastify.decorate('pg', mockPool);
  await registerAuth(fastify);
  registerTenantContext(fastify, mockPool);
  await fastify.register(whatsappWebhookRoutes, { prefix: '/api/v1' });

  fastify.get('/health', async (_req, reply) => reply.send({ status: 'ok' }));

  await fastify.ready();
  return fastify;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sprint 1 E2E — WhatsApp → Intent Queue', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-1' });
  });

  describe('GET /api/v1/webhooks/whatsapp — hub challenge', () => {
    it('returns 200 and the challenge when token matches', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'abc123',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('abc123');
    });

    it('returns 403 when verify token does not match', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'abc123',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 when hub.mode is not subscribe', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'unsubscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'abc123',
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/webhooks/whatsapp — inbound message', () => {
    it('enqueues an intent-detection job for a text message', async () => {
      const body = JSON.stringify(makeTextMessage());
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(body),
        },
        payload: body,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });

      expect(mockAdd).toHaveBeenCalledOnce();
      expect(mockAdd).toHaveBeenCalledWith(
        'detect-intent',
        expect.objectContaining({
          phoneNumberId: 'phone-123',
          rawMessageId: 'wamid.test.001',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          normalized: expect.objectContaining({
            externalId: 'wamid.test.001',
            senderPhone: '2348012345678',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            content: expect.objectContaining({ type: 'text', text: 'Submit monthly report' }),
          }),
        }),
      );
    });

    it('returns 401 when signature is missing', async () => {
      const body = JSON.stringify(makeTextMessage());
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/whatsapp',
        headers: { 'content-type': 'application/json' },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('returns 401 when signature is invalid', async () => {
      const body = JSON.stringify(makeTextMessage());
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=badhash',
        },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('ignores non-whatsapp_business_account payloads', async () => {
      const payload = { object: 'page', entry: [] };
      const body = JSON.stringify(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(body),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('ignores change entries where field is not messages', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'e1',
            changes: [{ field: 'statuses', value: { messaging_product: 'whatsapp' } }],
          },
        ],
      };
      const body = JSON.stringify(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(body),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('enqueues multiple jobs for multiple messages in one payload', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'e1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: 'phone-123' },
                  contacts: [{ wa_id: '2348012345678', profile: { name: 'User' } }],
                  messages: [
                    {
                      id: 'wamid.001',
                      from: '2348012345678',
                      timestamp: '1717977600',
                      type: 'text',
                      text: { body: 'First message' },
                    },
                    {
                      id: 'wamid.002',
                      from: '2348099999999',
                      timestamp: '1717977601',
                      type: 'text',
                      text: { body: 'Second message' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const body = JSON.stringify(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(body),
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(mockAdd).toHaveBeenCalledTimes(2);
    });
  });

  describe('Auth middleware — JWT protection on protected routes', () => {
    it('returns 401 on protected routes without a token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/some-protected-route',
      });
      // Route doesn't exist but auth runs first — should 401 not 404
      expect(res.statusCode).toBe(401);
    });

    it('/health is accessible without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('webhook GET is accessible without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'xyz',
        },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('InboundMessageProcessor — message type normalization', () => {
    const types = [
      {
        name: 'image',
        msg: { type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg', sha256: 'abc' } },
        expected: { type: 'image', mediaUrl: 'img-1' },
      },
      {
        name: 'audio',
        msg: { type: 'audio', audio: { id: 'aud-1', mime_type: 'audio/ogg' } },
        expected: { type: 'audio', mediaUrl: 'aud-1' },
      },
      {
        name: 'document',
        msg: {
          type: 'document',
          document: { id: 'doc-1', mime_type: 'application/pdf', filename: 'report.pdf' },
        },
        expected: { type: 'file', mediaUrl: 'doc-1' },
      },
    ] as const;

    for (const { name, msg, expected } of types) {
      it(`normalizes ${name} messages and enqueues them`, async () => {
        const payload = makeTextMessage(msg);
        const body = JSON.stringify(payload);
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/webhooks/whatsapp',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': sign(body),
          },
          payload: body,
        });
        expect(res.statusCode).toBe(200);
        expect(mockAdd).toHaveBeenCalledWith(
          'detect-intent',
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            normalized: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              content: expect.objectContaining(expected),
            }),
          }),
        );
      });
    }
  });
});

describe('WhatsAppProvider — outbound send', () => {
  it('returns error result when access token is not configured', async () => {
    const original = process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    const { WhatsAppProvider } = await import('@galaxy/communication');
    const provider = new WhatsAppProvider();
    const result = await provider.send('2348012345678', { type: 'text', text: 'Hello' });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('not configured');

    if (original !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = original;
  });
});
