/**
 * Communication OS — BroadcastService unit tests
 *
 * Covers: create · send (success + error path) · getById · list
 *
 * All DB calls, event publishing, and audit recording are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';
import { BroadcastService } from '../services/BroadcastService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const BROADCAST_ID = '00000000-0000-0000-0000-000000000030';
const ACTOR = '00000000-0000-0000-0000-000000000099';
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

function broadcastRow(
  overrides: Partial<{
    id: string;
    status: string;
    target_type: string;
    sent_at: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? BROADCAST_ID,
    organization_id: ORG,
    title: 'Monthly update',
    content: 'Here is what happened this month.',
    target_type: overrides.target_type ?? 'all',
    target_ids: [],
    status: overrides.status ?? 'pending',
    sent_count: 0,
    failed_count: 0,
    sent_by: ACTOR,
    sent_at: overrides.sent_at ?? null,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── create ─────────────────────────────────────────────────────────────────

describe('BroadcastService.create', () => {
  it('returns broadcast with pending status', async () => {
    const row = broadcastRow({ status: 'pending' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.create({
      organizationId: ORG,
      title: 'Monthly update',
      content: 'Here is what happened this month.',
      sentBy: ACTOR,
      correlationId: CORR,
    });
    expect(result).toMatchObject({
      id: BROADCAST_ID,
      organizationId: ORG,
      status: 'pending',
    });
  });

  it('defaults targetType to "all" when omitted', async () => {
    const row = broadcastRow({ target_type: 'all' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.create({
      organizationId: ORG,
      title: 'Update',
      content: 'Content',
      sentBy: ACTOR,
      correlationId: CORR,
    });
    expect(result.targetType).toBe('all');
  });

  it('throws Zod error for empty title', async () => {
    const pool = makePool([ok([])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    await expect(
      svc.create({
        organizationId: ORG,
        title: '',
        content: 'Content',
        sentBy: ACTOR,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('throws Zod error for invalid targetType', async () => {
    const pool = makePool([ok([])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const badType: unknown = 'unknown';
    await expect(
      svc.create({
        organizationId: ORG,
        title: 'Update',
        content: 'Content',
        targetType: badType as 'all',
        sentBy: ACTOR,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('sets tenant context before inserting', async () => {
    const row = broadcastRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    await svc.create({
      organizationId: ORG,
      title: 'Update',
      content: 'Content',
      sentBy: ACTOR,
      correlationId: CORR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });
});

// ─── send ────────────────────────────────────────────────────────────────────

describe('BroadcastService.send', () => {
  it('returns broadcast with status "sent" and publishes broadcast.sent event', async () => {
    const sentRow = broadcastRow({ status: 'sent', sent_at: NOW });
    // pool calls: setTenantContext · UPDATE RETURNING * · (event + audit are mocked)
    const pool = makePool([ok([]), ok([sentRow])]);
    const ep = makeEventPublisher();
    const svc = new BroadcastService(pool, ep, makeAuditService());
    const result = await svc.send(ORG, BROADCAST_ID, ACTOR, CORR);
    expect(result.status).toBe('sent');
    expect(ep.publish).toHaveBeenCalledOnce();
    expect(ep.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'broadcast.sent' }));
  });

  it('records audit entry after successful send', async () => {
    const sentRow = broadcastRow({ status: 'sent' });
    const pool = makePool([ok([]), ok([sentRow])]);
    const audit = makeAuditService();
    const svc = new BroadcastService(pool, makeEventPublisher(), audit);
    await svc.send(ORG, BROADCAST_ID, ACTOR, CORR);
    expect(audit.record).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'broadcast.sent' }),
    );
  });

  it('marks failed and publishes broadcast.failed when UPDATE returns no row', async () => {
    // call 1: setTenantContext · call 2: UPDATE RETURNING * → empty → throws
    // call 3 (catch): UPDATE SET status = failed
    const pool = makePool([ok([]), ok([]), ok([])]);
    const ep = makeEventPublisher();
    const svc = new BroadcastService(pool, ep, makeAuditService());
    await expect(svc.send(ORG, BROADCAST_ID, ACTOR, CORR)).rejects.toThrow(
      'UPDATE RETURNING returned no row',
    );
    expect(ep.publish).toHaveBeenCalledOnce();
    expect(ep.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'broadcast.failed' }));
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe('BroadcastService.getById', () => {
  it('returns broadcast when found', async () => {
    const pool = makePool([ok([]), ok([broadcastRow()])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, BROADCAST_ID);
    expect(result).toMatchObject({ id: BROADCAST_ID, organizationId: ORG });
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ─── list ────────────────────────────────────────────────────────────────────

describe('BroadcastService.list', () => {
  it('returns all broadcasts for the organization', async () => {
    const rows = [broadcastRow({ id: 'b1' }), broadcastRow({ id: 'b2' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.list(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no broadcasts exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new BroadcastService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.list(ORG);
    expect(result).toEqual([]);
  });
});
