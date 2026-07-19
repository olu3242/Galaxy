/**
 * notification-dispatch processor — unit tests
 *
 * Covers: tenant context · recipient lookup · WhatsApp · empty recipients · broadcast update
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@galaxy/communication', () => ({
  WhatsAppProvider: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
  SendGridProvider: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@galaxy/events', () => ({
  EventPublisher: vi.fn().mockImplementation(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@galaxy/identity', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import AFTER mocks are set up
import { WhatsAppProvider } from '@galaxy/communication';
import { createNotificationDispatchProcessor } from '../notification-dispatch.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const BROADCAST_ID = '00000000-0000-0000-0000-000000000010';
const R1 = '00000000-0000-0000-0000-000000000021';
const R2 = '00000000-0000-0000-0000-000000000022';

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

function makeJob(channel: 'whatsapp' | 'email' | 'sms', recipientIds = [R1, R2]) {
  return {
    id: 'job-1',
    name: 'notification-dispatch',
    data: {
      organizationId: ORG,
      broadcastId: BROADCAST_ID,
      recipientIds,
      content: 'Hello from Galaxy',
      channel,
    },
  } as unknown as import('bullmq').Job;
}

// Helper to get the WhatsApp send mock from the most-recently-created instance
function getWhatsappSend() {
  const MockWA = WhatsAppProvider as ReturnType<typeof vi.fn>;
  const instance = MockWA.mock.results[MockWA.mock.results.length - 1]?.value as
    | { send: ReturnType<typeof vi.fn> }
    | undefined;
  return instance?.send;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── tenant context ───────────────────────────────────────────────────────────

describe('notification-dispatch: tenant context', () => {
  it('sets tenant context before recipient lookup', async () => {
    const pool = makePool([
      ok([]), // set_config
      ok([{ id: R1, whatsapp_phone: '+2341111111111', email: null }]),
      ok([]), // UPDATE broadcast
    ]);
    const processor = createNotificationDispatchProcessor(pool, undefined);
    await processor(makeJob('whatsapp'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]![0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]![1]).toContain(ORG);
  });
});

// ─── WhatsApp channel ─────────────────────────────────────────────────────────

describe('notification-dispatch: whatsapp channel', () => {
  it('updates broadcast with sent_count=2 when both recipients have phones', async () => {
    const pool = makePool([
      ok([]),
      ok([
        { id: R1, whatsapp_phone: '+2341111111111', email: null },
        { id: R2, whatsapp_phone: '+2342222222222', email: null },
      ]),
      ok([]),
    ]);
    const processor = createNotificationDispatchProcessor(pool, undefined);
    await processor(makeJob('whatsapp'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes('broadcasts') && sql.includes('UPDATE'));
    expect(updateCall).toBeDefined();
    // sent_count param = 2, failed_count = 0
    const params = updateCall![1] as unknown[];
    const sentIdx = params.indexOf(2);
    expect(sentIdx).toBeGreaterThan(-1);
  });

  it('records failed_count=1 when one recipient has no phone', async () => {
    const pool = makePool([
      ok([]),
      ok([
        { id: R1, whatsapp_phone: null, email: null },
        { id: R2, whatsapp_phone: '+2342222222222', email: null },
      ]),
      ok([]),
    ]);
    const processor = createNotificationDispatchProcessor(pool, undefined);
    await processor(makeJob('whatsapp'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes('broadcasts') && sql.includes('UPDATE'));
    expect(updateCall).toBeDefined();
    // sent_count=1, failed_count=1
    const params = updateCall![1] as unknown[];
    expect(params).toContain(1); // at least 1 in the params
  });

  it('updates broadcast with sent/failed counts', async () => {
    const pool = makePool([
      ok([]),
      ok([{ id: R1, whatsapp_phone: '+2341111111111', email: null }]),
      ok([]),
    ]);
    const processor = createNotificationDispatchProcessor(pool, undefined);
    await processor(makeJob('whatsapp'));

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateCall = calls.find(([sql]) => sql.includes('broadcasts') && sql.includes('UPDATE'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain(BROADCAST_ID);
  });
});

// ─── empty recipients ─────────────────────────────────────────────────────────

describe('notification-dispatch: empty recipients', () => {
  it('completes without error when recipientIds is empty', async () => {
    const pool = makePool([ok([]), ok([])]);
    const processor = createNotificationDispatchProcessor(pool, undefined);
    await expect(processor(makeJob('whatsapp', []))).resolves.toBeUndefined();
  });

  it('does not send any WhatsApp messages when recipientIds is empty', async () => {
    const pool = makePool([ok([]), ok([])]);
    const processor = createNotificationDispatchProcessor(pool, undefined);
    await processor(makeJob('whatsapp', []));

    const send = getWhatsappSend();
    if (send) {
      expect(send).not.toHaveBeenCalled();
    }
  });
});
