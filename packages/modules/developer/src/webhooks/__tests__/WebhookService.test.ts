import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WebhookService } from '../WebhookService.js';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

const baseWebhookRow = {
  id: 'wh-1',
  organization_id: 'org-1',
  name: 'My Webhook',
  url: 'https://example.com/hook',
  secret: 'secret-xyz',
  event_types: ['workflow.submitted'],
  status: 'active',
  failure_count: 0,
  last_delivered_at: null,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const baseDeliveryRow = {
  id: 'del-1',
  organization_id: 'org-1',
  webhook_id: 'wh-1',
  event_type: 'workflow.submitted',
  payload: { foo: 'bar' },
  status: 'pending',
  response_status: null,
  response_body: null,
  attempt_count: 0,
  next_retry_at: null,
  delivered_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

describe('WebhookService', () => {
  describe('registerWebhook', () => {
    it('inserts and returns the webhook', async () => {
      const pool = makePool([ok([]), ok([baseWebhookRow])]);
      const svc = new WebhookService(pool);
      const wh = await svc.registerWebhook({
        organizationId: 'org-1',
        name: 'My Webhook',
        url: 'https://example.com/hook',
        eventTypes: ['workflow.submitted'],
      });
      expect(wh.id).toBe('wh-1');
      expect(wh.name).toBe('My Webhook');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WebhookService(pool);
      await expect(
        svc.registerWebhook({
          organizationId: 'org-1',
          name: 'My Webhook',
          url: 'https://example.com/hook',
          eventTypes: [],
        }),
      ).rejects.toThrow('Failed to register webhook');
    });
  });

  describe('listWebhooks', () => {
    it('returns all webhooks for an org', async () => {
      const pool = makePool([ok([]), ok([baseWebhookRow])]);
      const svc = new WebhookService(pool);
      const hooks = await svc.listWebhooks('org-1');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]?.id).toBe('wh-1');
    });
  });

  describe('getWebhook', () => {
    it('returns the webhook when found', async () => {
      const pool = makePool([ok([]), ok([baseWebhookRow])]);
      const svc = new WebhookService(pool);
      const wh = await svc.getWebhook('org-1', 'wh-1');
      expect(wh?.id).toBe('wh-1');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WebhookService(pool);
      const wh = await svc.getWebhook('org-1', 'missing');
      expect(wh).toBeNull();
    });

    it('maps lastDeliveredAt when present', async () => {
      const row = { ...baseWebhookRow, last_delivered_at: '2024-06-01T00:00:00Z' };
      const pool = makePool([ok([]), ok([row])]);
      const svc = new WebhookService(pool);
      const wh = await svc.getWebhook('org-1', 'wh-1');
      expect(wh?.lastDeliveredAt).toBe('2024-06-01T00:00:00Z');
    });
  });

  describe('deleteWebhook', () => {
    it('resolves without throwing', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WebhookService(pool);
      await expect(svc.deleteWebhook('org-1', 'wh-1')).resolves.toBeUndefined();
    });
  });

  describe('updateWebhook', () => {
    it('updates fields and returns updated webhook', async () => {
      const updatedRow = { ...baseWebhookRow, name: 'Updated' };
      const pool = makePool([ok([]), ok([updatedRow])]);
      const svc = new WebhookService(pool);
      const wh = await svc.updateWebhook('org-1', 'wh-1', { name: 'Updated' });
      expect(wh.name).toBe('Updated');
    });

    it('returns current webhook when no fields provided', async () => {
      // setTenantContext + getWebhook(setTenantContext + SELECT)
      const pool = makePool([ok([]), ok([]), ok([baseWebhookRow])]);
      const svc = new WebhookService(pool);
      const wh = await svc.updateWebhook('org-1', 'wh-1', {});
      expect(wh.id).toBe('wh-1');
    });

    it('throws when update returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new WebhookService(pool);
      await expect(svc.updateWebhook('org-1', 'wh-1', { name: 'X' })).rejects.toThrow(
        'Webhook not found',
      );
    });
  });

  describe('listDeliveries', () => {
    it('returns deliveries for a webhook', async () => {
      const pool = makePool([ok([]), ok([baseDeliveryRow])]);
      const svc = new WebhookService(pool);
      const deliveries = await svc.listDeliveries('org-1', 'wh-1');
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.id).toBe('del-1');
    });

    it('maps optional delivery fields when present', async () => {
      const row = {
        ...baseDeliveryRow,
        response_status: 200,
        response_body: 'ok',
        next_retry_at: '2024-01-02T00:00:00Z',
        delivered_at: '2024-01-01T01:00:00Z',
      };
      const pool = makePool([ok([]), ok([row])]);
      const svc = new WebhookService(pool);
      const deliveries = await svc.listDeliveries('org-1', 'wh-1');
      expect(deliveries[0]?.responseStatus).toBe(200);
      expect(deliveries[0]?.responseBody).toBe('ok');
      expect(deliveries[0]?.deliveredAt).toBe('2024-01-01T01:00:00Z');
    });
  });

  describe('deliver', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('creates delivery record and posts to webhook URL on success', async () => {
      // setTenantContext + getWebhook(setTenantContext + SELECT) + INSERT delivery
      // + attemptDelivery: UPDATE delivery + UPDATE webhook
      const pool = makePool([
        ok([]),
        ok([]),
        ok([baseWebhookRow]),
        ok([baseDeliveryRow]),
        ok([]),
        ok([]),
      ]);
      const svc = new WebhookService(pool);
      const delivery = await svc.deliver('org-1', 'wh-1', 'workflow.submitted', { id: '1' });
      expect(delivery.id).toBe('del-1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws when webhook not found', async () => {
      // setTenantContext + getWebhook(setTenantContext + SELECT = no rows)
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new WebhookService(pool);
      await expect(svc.deliver('org-1', 'wh-1', 'workflow.submitted', {})).rejects.toThrow(
        'Webhook not found',
      );
    });
  });
});
