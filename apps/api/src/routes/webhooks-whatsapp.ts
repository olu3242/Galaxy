import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { InboundMessageProcessor, type InboundWebhookPayload } from '@galaxy/communication';
import { EventPublisher } from '@galaxy/events';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';

function verifySignature(rawBody: Buffer, signature: string): boolean {
  if (!APP_SECRET) return false;
  const expected = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface HubChallengeQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

interface WhatsAppWebhookBody {
  object?: string;
  entry?: {
    id: string;
    changes: {
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string };
        contacts?: { wa_id: string; profile: { name: string } }[];
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string };
          audio?: { id: string; mime_type: string };
          document?: { id: string; mime_type: string; filename: string };
        }[];
      };
      field: string;
    }[];
  }[];
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function whatsappWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const intentQueue = new Queue('intent-detection', { connection: redis });
  const processor = new InboundMessageProcessor();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const eventPublisher = new EventPublisher(pool);

  // Hub challenge verification
  fastify.get(
    '/webhooks/whatsapp',
    async (request: FastifyRequest<{ Querystring: HubChallengeQuery }>, reply: FastifyReply) => {
      const {
        'hub.mode': mode,
        'hub.verify_token': token,
        'hub.challenge': challenge,
      } = request.query;
      if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
        return reply.status(200).send(challenge);
      }
      return reply.status(403).send({ error: 'Forbidden' });
    },
  );

  // Inbound message handler
  fastify.post(
    '/webhooks/whatsapp',
    {
      config: { rawBody: true },
    },
    async (request: FastifyRequest<{ Body: WhatsAppWebhookBody }>, reply: FastifyReply) => {
      // Signature verification
      const signature = request.headers['x-hub-signature-256'];
      if (typeof signature !== 'string') {
        return reply.status(401).send({ error: 'Missing signature' });
      }
      // rawBody is populated by Fastify's addContentTypeParser when rawBody option is used
      const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
      if (!rawBody || !verifySignature(rawBody, signature)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const correlationId = crypto.randomUUID();

      const body = request.body;
      if (body.object !== 'whatsapp_business_account') {
        return reply.status(200).send({ ok: true });
      }

      const jobs: Promise<unknown>[] = [];

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;
          for (const msg of change.value.messages ?? []) {
            const phoneNumberId = change.value.metadata.phone_number_id;
            const payload: InboundWebhookPayload = {
              from: msg.from,
              messageId: msg.id,
              timestamp: msg.timestamp,
              type: msg.type,
              ...(msg.text ? { text: msg.text } : {}),
              ...(msg.image ? { image: msg.image } : {}),
              ...(msg.audio ? { audio: msg.audio } : {}),
              ...(msg.document ? { document: msg.document } : {}),
            };
            const normalized = processor.process(payload);
            jobs.push(
              intentQueue.add('detect-intent', {
                phoneNumberId,
                normalized,
                rawMessageId: msg.id,
                correlationId,
              }),
            );
          }
        }
      }

      await Promise.all(jobs);

      // Emit webhook.received event (best-effort, non-fatal)
      const eventId = crypto.randomUUID();
      eventPublisher
        .publish({
          id: eventId,
          version: '1.0',
          type: 'webhook.received',
          tenantId: 'system',
          correlationId,
          causationId: correlationId,
          timestamp: new Date().toISOString(),
          actor: { type: 'system', id: 'whatsapp-webhook' },
          payload: { source: 'whatsapp' },
          metadata: {
            idempotencyKey: eventId,
            schemaVersion: '1.0',
            source: 'galaxy.api.webhooks',
          },
        })
        .catch(() => {
          // Non-fatal — do not block the response
        });

      return reply.status(200).send({ ok: true });
    },
  );

  fastify.addHook('onClose', async () => {
    await intentQueue.close();
    await redis.quit();
    await pool.end();
  });
}
