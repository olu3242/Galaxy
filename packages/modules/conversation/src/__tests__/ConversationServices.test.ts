/**
 * Conversation OS — ConversationSessionService · ConversationMessageService unit tests
 *
 * Covers: createSession · getSession · updateSessionStatus · updateSessionContext ·
 *         listSessions · closeSession ·
 *         ingestMessage · getMessages · updateMessageStatus · analyzeMessage
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ConversationSessionService } from '../sessions/ConversationSessionService.js';
import { ConversationMessageService } from '../messages/ConversationMessageService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const SESSION_ID = '00000000-0000-0000-0000-000000000010';
const MESSAGE_ID = '00000000-0000-0000-0000-000000000020';
const NOW = new Date('2026-01-01T00:00:00.000Z');

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

function sessionRow(overrides: Partial<{ status: string; closed_at: Date | null }> = {}) {
  return {
    id: SESSION_ID,
    organization_id: ORG,
    channel_type: 'whatsapp',
    external_id: 'ext-001',
    participant_id: 'member-1',
    status: overrides.status ?? 'OPEN',
    intent: null,
    language: null,
    sentiment: null,
    urgency_score: null,
    risk_score: null,
    context: {},
    memory: {},
    created_at: NOW,
    updated_at: NOW,
    closed_at: overrides.closed_at ?? null,
  };
}

function messageRow(overrides: Partial<{ status: string; intent: string | null }> = {}) {
  return {
    id: MESSAGE_ID,
    organization_id: ORG,
    session_id: SESSION_ID,
    direction: 'inbound',
    status: overrides.status ?? 'received',
    content: 'Hello, I need help',
    raw_payload: {},
    intent: overrides.intent ?? null,
    entities: {},
    sentiment: null,
    language: null,
    translated_content: null,
    created_at: NOW,
  };
}

// ─── ConversationSessionService ───────────────────────────────────────────────

describe('ConversationSessionService.createSession', () => {
  it('sets tenant context and returns mapped session', async () => {
    const pool = makePool([ok([]), ok([sessionRow()])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.createSession(ORG, 'whatsapp', 'ext-001', 'member-1');

    expect(result.id).toBe(SESSION_ID);
    expect(result.status).toBe('OPEN');
    expect(result.channelType).toBe('whatsapp');
    expect(result.organizationId).toBe(ORG);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when INSERT/UPSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.createSession(ORG, 'whatsapp', 'ext-001', 'member-1')).rejects.toThrow(
      'Failed to create conversation session',
    );
  });
});

describe('ConversationSessionService.getSession', () => {
  it('returns session when found', async () => {
    const pool = makePool([ok([]), ok([sessionRow()])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.getSession(ORG, SESSION_ID);
    expect(result.id).toBe(SESSION_ID);
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.getSession(ORG, 'ghost')).rejects.toThrow('Conversation session not found');
  });
});

describe('ConversationSessionService.updateSessionStatus', () => {
  it('returns session with updated status', async () => {
    const pool = makePool([ok([]), ok([sessionRow({ status: 'ACTIVE' })])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.updateSessionStatus(ORG, SESSION_ID, 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.updateSessionStatus(ORG, 'ghost', 'CLOSED')).rejects.toThrow(
      'Conversation session not found',
    );
  });
});

describe('ConversationSessionService.updateSessionContext', () => {
  it('returns session with context in params', async () => {
    const pool = makePool([ok([]), ok([sessionRow()])]);
    const svc = new ConversationSessionService(pool);
    await svc.updateSessionContext(ORG, SESSION_ID, { intent: 'support' });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(SESSION_ID);
  });
});

describe('ConversationSessionService.listSessions', () => {
  it('returns all sessions for org', async () => {
    const pool = makePool([ok([]), ok([sessionRow(), sessionRow()])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.listSessions(ORG);
    expect(result).toHaveLength(2);
  });

  it('filters by status when provided', async () => {
    const pool = makePool([ok([]), ok([sessionRow()])]);
    const svc = new ConversationSessionService(pool);
    await svc.listSessions(ORG, 'OPEN');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain('OPEN');
  });

  it('returns empty array when none exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.listSessions(ORG);
    expect(result).toHaveLength(0);
  });
});

describe('ConversationSessionService.closeSession', () => {
  it('returns session with CLOSED status', async () => {
    const pool = makePool([ok([]), ok([sessionRow({ status: 'CLOSED', closed_at: NOW })])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.closeSession(ORG, SESSION_ID);
    expect(result.status).toBe('CLOSED');
    expect(result.closedAt).toBeDefined();
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.closeSession(ORG, 'ghost')).rejects.toThrow('Conversation session not found');
  });
});

// ─── ConversationMessageService ───────────────────────────────────────────────

describe('ConversationMessageService.ingestMessage', () => {
  it('sets tenant context and returns message with received status', async () => {
    const pool = makePool([ok([]), ok([messageRow()])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hello', {});

    expect(result.id).toBe(MESSAGE_ID);
    expect(result.status).toBe('received');
    expect(result.direction).toBe('inbound');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await expect(svc.ingestMessage(ORG, SESSION_ID, 'inbound', 'Hi', {})).rejects.toThrow(
      'Failed to ingest conversation message',
    );
  });
});

describe('ConversationMessageService.getMessages', () => {
  it('returns messages for session', async () => {
    const pool = makePool([ok([]), ok([messageRow(), messageRow()])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.getMessages(ORG, SESSION_ID);
    expect(result).toHaveLength(2);
  });

  it('passes custom limit to query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await svc.getMessages(ORG, SESSION_ID, 25);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(25);
  });

  it('defaults to limit 100', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await svc.getMessages(ORG, SESSION_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(100);
  });
});

describe('ConversationMessageService.updateMessageStatus', () => {
  it('returns message with updated status', async () => {
    const pool = makePool([ok([]), ok([messageRow({ status: 'processed' })])]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.updateMessageStatus(ORG, MESSAGE_ID, 'processed');
    expect(result.status).toBe('processed');
  });

  it('throws when message not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await expect(svc.updateMessageStatus(ORG, 'ghost', 'processed')).rejects.toThrow(
      'Conversation message not found',
    );
  });
});

describe('ConversationMessageService.analyzeMessage', () => {
  it('returns message with processed status and intent set', async () => {
    const pool = makePool([
      ok([]),
      ok([messageRow({ status: 'processed', intent: 'support_request' })]),
    ]);
    const svc = new ConversationMessageService(pool);
    const result = await svc.analyzeMessage(ORG, MESSAGE_ID, 'support_request');
    expect(result.status).toBe('processed');
    expect(result.intent).toBe('support_request');
  });

  it('throws when message not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationMessageService(pool);
    await expect(svc.analyzeMessage(ORG, 'ghost')).rejects.toThrow(
      'Conversation message not found',
    );
  });
});
