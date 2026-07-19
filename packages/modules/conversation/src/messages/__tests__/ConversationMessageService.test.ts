import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ConversationMessageService } from '../ConversationMessageService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const SESSION_ID = '00000000-0000-0000-0000-000000000002';
const MESSAGE_ID = '00000000-0000-0000-0000-000000000003';

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

function makeMessageRow(
  overrides: Partial<{
    id: string;
    organization_id: string;
    session_id: string;
    direction: string;
    status: string;
    content: string;
    raw_payload: Record<string, unknown>;
    intent: string | null;
    entities: Record<string, unknown>;
    sentiment: string | null;
    language: string | null;
    translated_content: string | null;
    created_at: Date;
  }> = {},
) {
  return {
    id: MESSAGE_ID,
    organization_id: ORG,
    session_id: SESSION_ID,
    direction: 'inbound',
    status: 'received',
    content: 'Hello',
    raw_payload: {},
    intent: null,
    entities: {},
    sentiment: null,
    language: null,
    translated_content: null,
    created_at: new Date('2024-01-01'),
    ...overrides,
  };
}

type MockCalls = [string, unknown[]][];

describe('ConversationMessageService.ingestMessage', () => {
  it('sets tenant context before insert', async () => {
    const row = makeMessageRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    await svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hello', {});
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns a ConversationMessage on success', async () => {
    const row = makeMessageRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hello', {});
    expect(result.id).toBe(MESSAGE_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.direction).toBe('inbound');
    expect(result.status).toBe('received');
    expect(result.content).toBe('Hello');
  });

  it('throws when insert returns no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await expect(svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hello', {})).rejects.toThrow(
      'Failed to ingest conversation message',
    );
  });

  it('maps optional fields when non-null', async () => {
    const row = makeMessageRow({
      intent: 'support_request',
      sentiment: 'positive',
      language: 'en',
      translated_content: 'Hola',
    });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hello', {});
    expect(result.intent).toBe('support_request');
    expect(result.sentiment).toBe('positive');
    expect(result.language).toBe('en');
    expect(result.translatedContent).toBe('Hola');
  });

  it('does not include optional fields when row values are null', async () => {
    const row = makeMessageRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hello', {});
    expect(result).not.toHaveProperty('intent');
    expect(result).not.toHaveProperty('sentiment');
    expect(result).not.toHaveProperty('language');
    expect(result).not.toHaveProperty('translatedContent');
  });
});

describe('ConversationMessageService.getMessages', () => {
  it('returns messages for a session', async () => {
    const rows = [makeMessageRow({ id: 'a' }), makeMessageRow({ id: 'b' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.getMessages(ORG, SESSION_ID);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no messages', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.getMessages(ORG, SESSION_ID);
    expect(result).toEqual([]);
  });

  it('uses default limit of 100 when none specified', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await svc.getMessages(ORG, SESSION_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[1] ?? []).toContain(100);
  });

  it('respects custom limit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await svc.getMessages(ORG, SESSION_ID, 25);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[1] ?? []).toContain(25);
  });

  it('sets tenant context first', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await svc.getMessages(ORG, SESSION_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });
});

describe('ConversationMessageService.updateMessageStatus', () => {
  it('returns updated message', async () => {
    const row = makeMessageRow({ status: 'processed' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.updateMessageStatus(ORG, MESSAGE_ID, 'processed');
    expect(result.status).toBe('processed');
  });

  it('throws when message not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await expect(svc.updateMessageStatus(ORG, MESSAGE_ID, 'processed')).rejects.toThrow(
      'Conversation message not found',
    );
  });

  it('passes status as parameter not interpolated', async () => {
    const row = makeMessageRow({ status: 'failed' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    await svc.updateMessageStatus(ORG, MESSAGE_ID, 'failed');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[0]).not.toContain('failed');
    expect(calls[1]?.[1] ?? []).toContain('failed');
  });
});

describe('ConversationMessageService.analyzeMessage', () => {
  it('returns message with analysis fields', async () => {
    const row = makeMessageRow({
      intent: 'support_request',
      sentiment: 'neutral',
      language: 'en',
      status: 'processed',
    });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.analyzeMessage(
      ORG,
      MESSAGE_ID,
      'support_request',
      {},
      'neutral',
      'en',
    );
    expect(result.intent).toBe('support_request');
    expect(result.sentiment).toBe('neutral');
    expect(result.language).toBe('en');
    expect(result.status).toBe('processed');
  });

  it('throws when message not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await expect(svc.analyzeMessage(ORG, MESSAGE_ID)).rejects.toThrow(
      'Conversation message not found',
    );
  });

  it('sets tenant context before update', async () => {
    const row = makeMessageRow({ status: 'processed' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    await svc.analyzeMessage(ORG, MESSAGE_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('passes null for optional fields when not provided', async () => {
    const row = makeMessageRow({ status: 'processed' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationMessageService(pool);
    await svc.analyzeMessage(ORG, MESSAGE_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    const params = calls[1]?.[1] ?? [];
    // params[2] = intent, params[3] = entities, params[4] = sentiment, params[5] = language
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });
});
