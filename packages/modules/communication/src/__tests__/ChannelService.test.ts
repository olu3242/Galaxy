/**
 * Communication OS — ChannelService unit tests
 *
 * Covers: create · getById · list · delete · addMember · removeMember · listMembers
 *
 * All DB calls, event publishing, and audit recording are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';
import { ChannelService } from '../services/ChannelService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const CHANNEL_ID = '00000000-0000-0000-0000-000000000010';
const ACTOR = '00000000-0000-0000-0000-000000000099';
const CORR = '00000000-0000-0000-0000-000000000099';
const MEMBER_ID = '00000000-0000-0000-0000-000000000088';
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

function channelRow(
  overrides: Partial<{
    id: string;
    name: string;
    channel_type: string;
    is_archived: boolean;
    description: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? CHANNEL_ID,
    organization_id: ORG,
    name: overrides.name ?? 'General',
    description: overrides.description ?? null,
    channel_type: overrides.channel_type ?? 'group',
    is_archived: overrides.is_archived ?? false,
    created_by: ACTOR,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── create ─────────────────────────────────────────────────────────────────

describe('ChannelService.create', () => {
  it('returns the created channel mapped to domain object', async () => {
    const row = channelRow({ name: 'Announcements', channel_type: 'announcement' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.create({
      organizationId: ORG,
      name: 'Announcements',
      channelType: 'announcement',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    expect(result).toMatchObject({
      id: CHANNEL_ID,
      organizationId: ORG,
      name: 'Announcements',
      channelType: 'announcement',
      isArchived: false,
    });
  });

  it('defaults channelType to "group" when omitted', async () => {
    const row = channelRow({ channel_type: 'group' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.create({
      organizationId: ORG,
      name: 'General',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    expect(result.channelType).toBe('group');
  });

  it('publishes channel.created event', async () => {
    const row = channelRow();
    const pool = makePool([ok([]), ok([row])]);
    const ep = makeEventPublisher();
    const svc = new ChannelService(pool, ep, makeAuditService());
    await svc.create({
      organizationId: ORG,
      name: 'General',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    expect(ep.publish).toHaveBeenCalledOnce();
    const [event] = (ep.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [{ type: string }];
    expect(event?.type).toBe('channel.created');
  });

  it('records an audit entry', async () => {
    const row = channelRow();
    const pool = makePool([ok([]), ok([row])]);
    const audit = makeAuditService();
    const svc = new ChannelService(pool, makeEventPublisher(), audit);
    await svc.create({
      organizationId: ORG,
      name: 'General',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    expect(audit.record).toHaveBeenCalledOnce();
    const [input] = (audit.record as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { action: string },
    ];
    expect(input?.action).toBe('channel.created');
  });

  it('throws Zod error for invalid channelType', async () => {
    const pool = makePool([ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    await expect(
      svc.create({
        organizationId: ORG,
        name: 'Bad',
        channelType: 'invalid' as never,
        createdBy: ACTOR,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('sets tenant context before inserting', async () => {
    const row = channelRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    await svc.create({
      organizationId: ORG,
      name: 'General',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe('ChannelService.getById', () => {
  it('returns channel when found', async () => {
    const pool = makePool([ok([]), ok([channelRow()])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, CHANNEL_ID);
    expect(result).toMatchObject({ id: CHANNEL_ID, organizationId: ORG });
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ─── list ────────────────────────────────────────────────────────────────────

describe('ChannelService.list', () => {
  it('returns all non-archived channels', async () => {
    const rows = [channelRow({ id: 'c1' }), channelRow({ id: 'c2' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.list(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no channels exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.list(ORG);
    expect(result).toEqual([]);
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('ChannelService.delete', () => {
  it('soft-deletes channel and records audit', async () => {
    const pool = makePool([ok([]), ok([])]);
    const audit = makeAuditService();
    const svc = new ChannelService(pool, makeEventPublisher(), audit);
    await svc.delete(ORG, CHANNEL_ID, ACTOR, CORR);
    expect(audit.record).toHaveBeenCalledOnce();
    const [input] = (audit.record as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { action: string; resourceId: string },
    ];
    expect(input?.action).toBe('channel.deleted');
    expect(input?.resourceId).toBe(CHANNEL_ID);
  });

  it('passes organizationId and channelId to the UPDATE query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    await svc.delete(ORG, CHANNEL_ID, ACTOR, CORR);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const updateParams = calls[1]?.[1] ?? [];
    expect(updateParams).toContain(CHANNEL_ID);
    expect(updateParams).toContain(ORG);
  });
});

// ─── addMember ───────────────────────────────────────────────────────────────

describe('ChannelService.addMember', () => {
  it('inserts member and publishes channel.member.added event', async () => {
    const pool = makePool([ok([]), ok([])]);
    const ep = makeEventPublisher();
    const svc = new ChannelService(pool, ep, makeAuditService());
    await svc.addMember({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      memberId: MEMBER_ID,
      actorId: ACTOR,
      correlationId: CORR,
    });
    expect(ep.publish).toHaveBeenCalledOnce();
    const [event] = (ep.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [{ type: string }];
    expect(event?.type).toBe('channel.member.added');
  });

  it('defaults role to "member" when not specified', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    await svc.addMember({
      organizationId: ORG,
      channelId: CHANNEL_ID,
      memberId: MEMBER_ID,
      actorId: ACTOR,
      correlationId: CORR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const insertParams = calls[1]?.[1] ?? [];
    expect(insertParams).toContain('member');
  });
});

// ─── removeMember ────────────────────────────────────────────────────────────

describe('ChannelService.removeMember', () => {
  it('deletes the member row scoped to org, channel, and member', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    await svc.removeMember(ORG, CHANNEL_ID, MEMBER_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const deleteParams = calls[1]?.[1] ?? [];
    expect(deleteParams).toContain(CHANNEL_ID);
    expect(deleteParams).toContain(MEMBER_ID);
    expect(deleteParams).toContain(ORG);
  });
});

// ─── listMembers ─────────────────────────────────────────────────────────────

describe('ChannelService.listMembers', () => {
  it('maps rows to memberId/role/joinedAt objects', async () => {
    const memberRows = [
      { member_id: MEMBER_ID, role: 'admin', joined_at: NOW },
      { member_id: ACTOR, role: 'member', joined_at: NOW },
    ];
    const pool = makePool([ok([]), ok(memberRows)]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.listMembers(ORG, CHANNEL_ID);
    expect(result).toMatchObject([
      { memberId: MEMBER_ID, role: 'admin', joinedAt: NOW },
      { memberId: ACTOR, role: 'member', joinedAt: NOW },
    ]);
  });

  it('returns empty array when channel has no members', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new ChannelService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.listMembers(ORG, CHANNEL_ID);
    expect(result).toEqual([]);
  });
});
