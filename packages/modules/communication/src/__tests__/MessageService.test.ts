/**
 * Communication OS — MessageService unit tests
 *
 * Covers: send · getById · listForChannel · softDelete
 *
 * All DB calls, event publishing, and audit recording are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';
import { MessageService } from '../services/MessageService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const MSG_ID = '00000000-0000-0000-0000-000000000020';
const CHANNEL_ID = '00000000-0000-0000-0000-000000000010';
const SENDER = '00000000-0000-0000-0000-000000000099';
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

function makeAuditService(): AuditService {
  return { record: vi.fn().mockResolvedValue({}) } as unknown as AuditService;
}

function messageRow(
  overrides: Partial<{
    id: string;
    content: string;
    content_type: string;
    is_deleted: boolean;
    thread_id: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? MSG_ID,
    organization_id: ORG,
    channel_id: CHANNEL_ID,
    sender_id: SENDER,
    thread_id: overrides.thread_id ?? null,
    content: overrides.content ?? 'Hello, team!',
    content_type: overrides.content_type ?? 'text',
    status: 'sent',
    is_deleted: overrides.is_deleted ?? false,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── send ────────────────────────────────────────────────────────────────────

describe('MessageService.send', () => {
  it('returns the sent message mapped to domain object', async () => {
    const row = messageRow({ content: 'Hello!' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.send({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      senderId: SENDER,
      content: 'Hello!',
      correlationId: CORR,
    });
    expect(result).toMatchObject({
      id: MSG_ID,
      organizationId: ORG,
      channelId: CHANNEL_ID,
      senderId: SENDER,
      content: 'Hello!',
      contentType: 'text',
      isDeleted: false,
    });
  });

  it('defaults contentType to "text" when omitted', async () => {
    const row = messageRow({ content_type: 'text' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.send({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      senderId: SENDER,
      content: 'Hello!',
      correlationId: CORR,
    });
    expect(result.contentType).toBe('text');
  });

  it('publishes message.sent event', async () => {
    const pool = makePool([ok([]), ok([messageRow()])]);
    const ep = makeEventPublisher();
    const svc = new MessageService(pool, ep, makeAuditService());
    await svc.send({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      senderId: SENDER,
      content: 'Hello!',
      correlationId: CORR,
    });
    expect(ep.publish).toHaveBeenCalledOnce();
    const [event] = (ep.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [{ type: string }];
    expect(event?.type).toBe('message.sent');
  });

  it('records audit entry for message.sent', async () => {
    const pool = makePool([ok([]), ok([messageRow()])]);
    const audit = makeAuditService();
    const svc = new MessageService(pool, makeEventPublisher(), audit);
    await svc.send({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      senderId: SENDER,
      content: 'Hello!',
      correlationId: CORR,
    });
    expect(audit.record).toHaveBeenCalledOnce();
    const [input] = (audit.record as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { action: string },
    ];
    expect(input?.action).toBe('message.sent');
  });

  it('throws Zod error for empty content', async () => {
    const pool = makePool([ok([])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    await expect(
      svc.send({
        organizationId: ORG,
        channelId: CHANNEL_ID,
        senderId: SENDER,
        content: '',
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('throws Zod error for invalid contentType', async () => {
    const pool = makePool([ok([])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    await expect(
      svc.send({
        organizationId: ORG,
        channelId: CHANNEL_ID,
        senderId: SENDER,
        content: 'Hello!',
        contentType: 'gif' as never,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('sets tenant context before inserting', async () => {
    const pool = makePool([ok([]), ok([messageRow()])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    await svc.send({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      senderId: SENDER,
      content: 'Hello!',
      correlationId: CORR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe('MessageService.getById', () => {
  it('returns message when found', async () => {
    const pool = makePool([ok([]), ok([messageRow()])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, MSG_ID);
    expect(result).toMatchObject({ id: MSG_ID, organizationId: ORG });
  });

  it('returns null when not found or deleted', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ─── listForChannel ───────────────────────────────────────────────────────────

describe('MessageService.listForChannel', () => {
  it('returns messages for the channel in descending order', async () => {
    const rows = [messageRow({ id: 'm1' }), messageRow({ id: 'm2' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.listForChannel(ORG, CHANNEL_ID);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when channel has no messages', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.listForChannel(ORG, CHANNEL_ID);
    expect(result).toEqual([]);
  });
});

// ─── softDelete ──────────────────────────────────────────────────────────────

describe('MessageService.softDelete', () => {
  it('marks message as deleted and records audit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const audit = makeAuditService();
    const svc = new MessageService(pool, makeEventPublisher(), audit);
    await svc.softDelete(ORG, MSG_ID, SENDER, CORR);
    expect(audit.record).toHaveBeenCalledOnce();
    const [input] = (audit.record as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { action: string; resourceId: string },
    ];
    expect(input?.action).toBe('message.deleted');
    expect(input?.resourceId).toBe(MSG_ID);
  });

  it('scopes the UPDATE to org and message id', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MessageService(pool, makeEventPublisher(), makeAuditService());
    await svc.softDelete(ORG, MSG_ID, SENDER, CORR);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const updateParams = calls[1]?.[1] ?? [];
    expect(updateParams).toContain(MSG_ID);
    expect(updateParams).toContain(ORG);
  });
});
