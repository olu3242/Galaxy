/**
 * NotificationService unit tests
 *
 * Covers: create · getById · listForMember · markAsRead
 *
 * All DB calls and event publishing are mocked — no real database.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { NotificationService } from '../services/NotificationService.js';
import type { NotificationRow } from '../types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const NOTIF_ID = '00000000-0000-0000-0000-000000000010';
const MEMBER_ID = '00000000-0000-0000-0000-000000000020';
const ACTOR_ID = '00000000-0000-0000-0000-000000000030';
const CORR = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

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

function makeEventPublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;
}

function notifRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: NOTIF_ID,
    organization_id: ORG,
    recipient_id: MEMBER_ID,
    template_id: null,
    channel: 'in_app',
    title: 'Test notification',
    body: 'Hello, world!',
    status: 'pending',
    read_at: null,
    data: {},
    correlation_id: CORR,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─── create ──────────────────────────────────────────────────────────────────

describe('NotificationService.create', () => {
  it('sets tenant context then inserts and returns the notification', async () => {
    const row = notifRow();
    const pool = makePool([ok([]), ok([row])]);
    const publisher = makeEventPublisher();
    const svc = new NotificationService(pool, publisher);

    const result = await svc.create({
      organizationId: ORG,
      recipientId: MEMBER_ID,
      channel: 'in_app',
      title: 'Test notification',
      body: 'Hello, world!',
      actorId: ACTOR_ID,
      correlationId: CORR,
    });

    expect(result.id).toBe(NOTIF_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.channel).toBe('in_app');
    expect(result.title).toBe('Test notification');
    expect(result.status).toBe('pending');

    // tenant context must be set first
    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });

  it('publishes a notification.sent event after insert', async () => {
    const row = notifRow();
    const pool = makePool([ok([]), ok([row])]);
    const publisher = makeEventPublisher();
    const svc = new NotificationService(pool, publisher);

    await svc.create({
      organizationId: ORG,
      recipientId: MEMBER_ID,
      channel: 'in_app',
      title: 'Test notification',
      body: 'Hello, world!',
      actorId: ACTOR_ID,
      correlationId: CORR,
    });

    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notification.sent', tenantId: ORG }),
    );
  });

  it('maps templateId when provided', async () => {
    const TMPL_ID = '00000000-0000-0000-0000-000000000050';
    const row = notifRow({ template_id: TMPL_ID });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    const result = await svc.create({
      organizationId: ORG,
      recipientId: MEMBER_ID,
      templateId: TMPL_ID,
      channel: 'in_app',
      title: 'Test notification',
      body: 'Hello!',
      actorId: ACTOR_ID,
      correlationId: CORR,
    });

    expect(result.templateId).toBe(TMPL_ID);
  });

  it('throws ZodError for invalid channel', async () => {
    const pool = makePool([]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await expect(
      svc.create({
        organizationId: ORG,
        recipientId: MEMBER_ID,
        channel: 'carrier_pigeon',
        title: 'Test',
        body: 'Body',
        actorId: ACTOR_ID,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('throws ZodError for empty title', async () => {
    const pool = makePool([]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await expect(
      svc.create({
        organizationId: ORG,
        recipientId: MEMBER_ID,
        channel: 'in_app',
        title: '',
        body: 'Body',
        actorId: ACTOR_ID,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('throws when INSERT RETURNING returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await expect(
      svc.create({
        organizationId: ORG,
        recipientId: MEMBER_ID,
        channel: 'in_app',
        title: 'Test',
        body: 'Body',
        actorId: ACTOR_ID,
        correlationId: CORR,
      }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe('NotificationService.getById', () => {
  it('returns the notification when found', async () => {
    const row = notifRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    const result = await svc.getById(ORG, NOTIF_ID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(NOTIF_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    const result = await svc.getById(ORG, NOTIF_ID);
    expect(result).toBeNull();
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await svc.getById(ORG, NOTIF_ID);

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });
});

// ─── listForMember ────────────────────────────────────────────────────────────

describe('NotificationService.listForMember', () => {
  it('returns mapped notifications for a member', async () => {
    const rows = [
      notifRow({ id: NOTIF_ID }),
      notifRow({ id: '00000000-0000-0000-0000-000000000011' }),
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new NotificationService(pool, makeEventPublisher());

    const result = await svc.listForMember(ORG, MEMBER_ID);
    expect(result).toHaveLength(2);
    expect(result[0]?.organizationId).toBe(ORG);
  });

  it('returns empty array when member has no notifications', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    const result = await svc.listForMember(ORG, MEMBER_ID);
    expect(result).toEqual([]);
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await svc.listForMember(ORG, MEMBER_ID);

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });
});

// ─── markAsRead ───────────────────────────────────────────────────────────────

describe('NotificationService.markAsRead', () => {
  it('returns the notification with status=read', async () => {
    const row = notifRow({ status: 'read', read_at: NOW });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    const result = await svc.markAsRead(ORG, NOTIF_ID, MEMBER_ID);
    expect(result.status).toBe('read');
    expect(result.readAt).toBe(NOW);
  });

  it('throws when notification is not found or not owned by member', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await expect(svc.markAsRead(ORG, NOTIF_ID, MEMBER_ID)).rejects.toThrow(
      `Notification ${NOTIF_ID} not found`,
    );
  });

  it('sets tenant context before updating', async () => {
    const row = notifRow({ status: 'read', read_at: NOW });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationService(pool, makeEventPublisher());

    await svc.markAsRead(ORG, NOTIF_ID, MEMBER_ID);

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });
});
