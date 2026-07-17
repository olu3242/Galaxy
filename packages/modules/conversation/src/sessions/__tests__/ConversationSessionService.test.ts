import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ConversationSessionService } from '../ConversationSessionService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const SESSION_ID = '00000000-0000-0000-0000-000000000002';

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

function makeSessionRow(
  overrides: Partial<{
    id: string;
    organization_id: string;
    channel_type: string;
    external_id: string;
    participant_id: string;
    status: string;
    intent: string | null;
    language: string | null;
    sentiment: string | null;
    urgency_score: number | null;
    risk_score: number | null;
    context: Record<string, unknown>;
    memory: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    closed_at: Date | null;
  }> = {},
) {
  return {
    id: SESSION_ID,
    organization_id: ORG,
    channel_type: 'whatsapp',
    external_id: 'ext-123',
    participant_id: 'part-456',
    status: 'OPEN',
    intent: null,
    language: null,
    sentiment: null,
    urgency_score: null,
    risk_score: null,
    context: {},
    memory: {},
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    closed_at: null,
    ...overrides,
  };
}

type MockCalls = [string, unknown[]][];

describe('ConversationSessionService.createSession', () => {
  it('sets tenant context before insert', async () => {
    const row = makeSessionRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    await svc.createSession(ORG, 'whatsapp', 'ext-123', 'part-456');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns a ConversationSession on success', async () => {
    const row = makeSessionRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.createSession(ORG, 'whatsapp', 'ext-123', 'part-456');
    expect(result.id).toBe(SESSION_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.channelType).toBe('whatsapp');
    expect(result.status).toBe('OPEN');
  });

  it('maps optional fields when non-null', async () => {
    const row = makeSessionRow({
      intent: 'support_request',
      language: 'en',
      sentiment: 'positive',
      urgency_score: 0.8,
      risk_score: 0.1,
    });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.createSession(ORG, 'whatsapp', 'ext-123', 'part-456');
    expect(result.intent).toBe('support_request');
    expect(result.language).toBe('en');
    expect(result.sentiment).toBe('positive');
    expect(result.urgencyScore).toBe(0.8);
    expect(result.riskScore).toBe(0.1);
  });

  it('throws when insert returns no rows', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.createSession(ORG, 'whatsapp', 'ext-123', 'part-456')).rejects.toThrow(
      'Failed to create conversation session',
    );
  });

  it('does not interpolate orgId into SQL string', async () => {
    const row = makeSessionRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    await svc.createSession(ORG, 'whatsapp', 'ext-123', 'part-456');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[0]).not.toContain(ORG);
  });
});

describe('ConversationSessionService.getSession', () => {
  it('returns session when found', async () => {
    const row = makeSessionRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.getSession(ORG, SESSION_ID);
    expect(result.id).toBe(SESSION_ID);
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.getSession(ORG, SESSION_ID)).rejects.toThrow('Conversation session not found');
  });

  it('sets tenant context first', async () => {
    const row = makeSessionRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    await svc.getSession(ORG, SESSION_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('maps closedAt when session is closed', async () => {
    const closedAt = new Date('2024-06-01');
    const row = makeSessionRow({ status: 'CLOSED', closed_at: closedAt });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.getSession(ORG, SESSION_ID);
    expect(result.closedAt).toEqual(closedAt);
  });
});

describe('ConversationSessionService.updateSessionStatus', () => {
  it('updates status and returns updated session', async () => {
    const row = makeSessionRow({ status: 'ACTIVE' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.updateSessionStatus(ORG, SESSION_ID, 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.updateSessionStatus(ORG, SESSION_ID, 'CLOSED')).rejects.toThrow(
      'Conversation session not found',
    );
  });

  it('passes status as a parameter not interpolated', async () => {
    const row = makeSessionRow({ status: 'CLOSED' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    await svc.updateSessionStatus(ORG, SESSION_ID, 'CLOSED');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[0]).not.toContain('CLOSED');
    expect(calls[1]?.[1] ?? []).toContain('CLOSED');
  });
});

describe('ConversationSessionService.updateSessionContext', () => {
  it('returns session with updated context', async () => {
    const row = makeSessionRow({ context: { key: 'value' } });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.updateSessionContext(ORG, SESSION_ID, { key: 'value' });
    expect(result.context).toEqual({ key: 'value' });
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.updateSessionContext(ORG, SESSION_ID, {})).rejects.toThrow(
      'Conversation session not found',
    );
  });
});

describe('ConversationSessionService.listSessions', () => {
  it('returns all sessions for an org', async () => {
    const rows = [makeSessionRow({ id: 'a' }), makeSessionRow({ id: 'b' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.listSessions(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no sessions found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.listSessions(ORG);
    expect(result).toEqual([]);
  });

  it('filters by status when provided', async () => {
    const row = makeSessionRow({ status: 'OPEN' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    await svc.listSessions(ORG, 'OPEN');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[1] ?? []).toContain('OPEN');
  });

  it('uses default limit of 50 when none specified', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await svc.listSessions(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[1] ?? []).toContain(50);
  });

  it('respects custom limit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await svc.listSessions(ORG, undefined, 10);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[1]?.[1] ?? []).toContain(10);
  });
});

describe('ConversationSessionService.closeSession', () => {
  it('returns closed session', async () => {
    const closedAt = new Date('2024-06-01');
    const row = makeSessionRow({ status: 'CLOSED', closed_at: closedAt });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    const result = await svc.closeSession(ORG, SESSION_ID);
    expect(result.status).toBe('CLOSED');
    expect(result.closedAt).toEqual(closedAt);
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ConversationSessionService(pool);
    await expect(svc.closeSession(ORG, SESSION_ID)).rejects.toThrow(
      'Conversation session not found',
    );
  });

  it('sets tenant context before updating', async () => {
    const row = makeSessionRow({ status: 'CLOSED', closed_at: new Date() });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ConversationSessionService(pool);
    await svc.closeSession(ORG, SESSION_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as MockCalls;
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
  });
});
