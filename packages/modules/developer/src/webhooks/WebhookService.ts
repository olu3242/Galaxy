import { createHmac, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type {
  Webhook,
  WebhookDelivery,
  WebhookStatus,
  WebhookDeliveryStatus,
  CreateWebhookInput,
} from '../types.js';

interface WebhookRow {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  secret: string;
  event_types: string[];
  status: string;
  failure_count: number;
  last_delivered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface WebhookDeliveryRow {
  id: string;
  organization_id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

function rowToWebhook(row: WebhookRow): Webhook {
  const hook: Webhook = {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    url: row.url,
    secret: row.secret,
    eventTypes: row.event_types,
    status: row.status as WebhookStatus,
    failureCount: row.failure_count,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.last_delivered_at !== null) {
    hook.lastDeliveredAt = row.last_delivered_at;
  }
  return hook;
}

function rowToDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  const delivery: WebhookDelivery = {
    id: row.id,
    organizationId: row.organization_id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload: row.payload,
    status: row.status as WebhookDeliveryStatus,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
  };
  if (row.response_status !== null) {
    delivery.responseStatus = row.response_status;
  }
  if (row.response_body !== null) {
    delivery.responseBody = row.response_body;
  }
  if (row.next_retry_at !== null) {
    delivery.nextRetryAt = row.next_retry_at;
  }
  if (row.delivered_at !== null) {
    delivery.deliveredAt = row.delivered_at;
  }
  return delivery;
}

export class WebhookService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS_MS = [60000, 300000, 3600000]; // 1m, 5m, 1h

  constructor(private readonly pool: Pool) {}

  async registerWebhook(input: CreateWebhookInput): Promise<Webhook> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const secret = randomBytes(32).toString('hex');

    const result = await this.pool.query<WebhookRow>(
      `INSERT INTO webhooks (organization_id, name, url, secret, event_types, status, failure_count, metadata)
       VALUES ($1, $2, $3, $4, $5, 'active', 0, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.url,
        secret,
        input.eventTypes,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to register webhook');
    return rowToWebhook(row);
  }

  async updateWebhook(
    orgId: string,
    webhookId: string,
    updates: { name?: string; url?: string; eventTypes?: string[]; status?: WebhookStatus },
  ): Promise<Webhook> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${String(idx++)}`);
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      fields.push(`url = $${String(idx++)}`);
      values.push(updates.url);
    }
    if (updates.eventTypes !== undefined) {
      fields.push(`event_types = $${String(idx++)}`);
      values.push(updates.eventTypes);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${String(idx++)}`);
      values.push(updates.status);
    }

    if (fields.length === 0) {
      const hook = await this.getWebhook(orgId, webhookId);
      if (!hook) throw new Error('Webhook not found');
      return hook;
    }

    fields.push('updated_at = NOW()');
    values.push(webhookId, orgId);

    const result = await this.pool.query<WebhookRow>(
      `UPDATE webhooks SET ${fields.join(', ')}
       WHERE id = $${String(idx++)} AND organization_id = $${String(idx)}
       RETURNING *`,
      values,
    );

    const row = result.rows[0];
    if (!row) throw new Error('Webhook not found');
    return rowToWebhook(row);
  }

  async deleteWebhook(orgId: string, webhookId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    await this.pool.query('DELETE FROM webhooks WHERE id = $1 AND organization_id = $2', [
      webhookId,
      orgId,
    ]);
  }

  async listWebhooks(orgId: string): Promise<Webhook[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<WebhookRow>(
      'SELECT * FROM webhooks WHERE organization_id = $1 ORDER BY created_at DESC',
      [orgId],
    );

    return result.rows.map(rowToWebhook);
  }

  async getWebhook(orgId: string, webhookId: string): Promise<Webhook | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<WebhookRow>(
      'SELECT * FROM webhooks WHERE id = $1 AND organization_id = $2',
      [webhookId, orgId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return rowToWebhook(row);
  }

  async deliver(
    orgId: string,
    webhookId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookDelivery> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const webhook = await this.getWebhook(orgId, webhookId);
    if (!webhook) throw new Error('Webhook not found');

    const deliveryResult = await this.pool.query<WebhookDeliveryRow>(
      `INSERT INTO webhook_deliveries (organization_id, webhook_id, event_type, payload, status, attempt_count)
       VALUES ($1, $2, $3, $4, 'pending', 0)
       RETURNING *`,
      [orgId, webhookId, eventType, JSON.stringify(payload)],
    );

    const deliveryRow = deliveryResult.rows[0];
    if (!deliveryRow) throw new Error('Failed to create delivery record');

    const delivery = rowToDelivery(deliveryRow);
    await this.attemptDelivery(webhook, delivery, payload);
    return delivery;
  }

  private computeSignature(secret: string, payload: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  }

  private async attemptDelivery(
    webhook: Webhook,
    delivery: WebhookDelivery,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.computeSignature(webhook.secret, body);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Galaxy-Signature-256': signature,
          'X-Galaxy-Event': delivery.eventType,
          'X-Galaxy-Delivery': delivery.id,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      const responseBody = await response.text();
      const success = response.status >= 200 && response.status < 300;

      await this.pool.query(
        `UPDATE webhook_deliveries
         SET status = $1, response_status = $2, response_body = $3, attempt_count = attempt_count + 1,
             delivered_at = CASE WHEN $4 THEN NOW() ELSE NULL END
         WHERE id = $5`,
        [
          success ? 'delivered' : 'failed',
          response.status,
          responseBody.slice(0, 1000),
          success,
          delivery.id,
        ],
      );

      if (success) {
        await this.pool.query(
          `UPDATE webhooks SET failure_count = 0, last_delivered_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [webhook.id],
        );
      } else {
        await this.scheduleRetry(webhook, delivery);
      }
    } catch {
      await this.pool.query(
        `UPDATE webhook_deliveries
         SET status = 'failed', attempt_count = attempt_count + 1
         WHERE id = $1`,
        [delivery.id],
      );
      await this.scheduleRetry(webhook, delivery);
    }
  }

  private async scheduleRetry(webhook: Webhook, delivery: WebhookDelivery): Promise<void> {
    const attemptCount = delivery.attemptCount + 1;

    await this.pool.query(
      'UPDATE webhooks SET failure_count = failure_count + 1, updated_at = NOW() WHERE id = $1',
      [webhook.id],
    );

    if (attemptCount >= WebhookService.MAX_RETRIES) {
      await this.pool.query("UPDATE webhook_deliveries SET status = 'dead_letter' WHERE id = $1", [
        delivery.id,
      ]);
      await this.pool.query(
        "UPDATE webhooks SET status = 'failed', updated_at = NOW() WHERE id = $1 AND failure_count >= 10",
        [webhook.id],
      );
      return;
    }

    const delayMs =
      WebhookService.RETRY_DELAYS_MS[attemptCount] ??
      WebhookService.RETRY_DELAYS_MS[WebhookService.RETRY_DELAYS_MS.length - 1] ??
      3600000;
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

    await this.pool.query(
      "UPDATE webhook_deliveries SET status = 'pending', next_retry_at = $1 WHERE id = $2",
      [nextRetryAt, delivery.id],
    );
  }

  async listDeliveries(orgId: string, webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<WebhookDeliveryRow>(
      `SELECT * FROM webhook_deliveries
       WHERE organization_id = $1 AND webhook_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [orgId, webhookId, limit],
    );

    return result.rows.map(rowToDelivery);
  }
}
