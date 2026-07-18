/**
 * Communication OS — AnnouncementService unit tests
 *
 * Covers: create · publish · archive · getById · list
 *
 * All DB calls, event publishing, and audit recording are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';
import { AnnouncementService } from '../services/AnnouncementService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const ANN_ID = '00000000-0000-0000-0000-000000000040';
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

function announcementRow(
  overrides: Partial<{
    id: string;
    status: string;
    published_by: string | null;
    published_at: string | null;
    expires_at: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? ANN_ID,
    organization_id: ORG,
    title: 'Town hall next Friday',
    body: 'Please join us for the all-hands meeting.',
    status: overrides.status ?? 'draft',
    published_by: overrides.published_by ?? null,
    published_at: overrides.published_at ?? null,
    expires_at: overrides.expires_at ?? null,
    metadata: {},
    created_by: ACTOR,
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── create ─────────────────────────────────────────────────────────────────

describe('AnnouncementService.create', () => {
  it('returns announcement with draft status', async () => {
    const row = announcementRow({ status: 'draft' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.create({
      organizationId: ORG,
      title: 'Town hall next Friday',
      body: 'Please join us for the all-hands meeting.',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    expect(result).toMatchObject({
      id: ANN_ID,
      organizationId: ORG,
      status: 'draft',
      publishedAt: null,
    });
  });

  it('passes expiresAt to the INSERT query when provided', async () => {
    const expires = '2026-02-01T00:00:00.000Z';
    const row = announcementRow({ expires_at: expires });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    await svc.create({
      organizationId: ORG,
      title: 'Limited time announcement',
      body: 'This expires soon.',
      expiresAt: expires,
      createdBy: ACTOR,
      correlationId: CORR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const insertParams = calls[1]?.[1] ?? [];
    expect(insertParams).toContain(expires);
  });

  it('throws Zod error for empty title', async () => {
    const pool = makePool([ok([])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    await expect(
      svc.create({
        organizationId: ORG,
        title: '',
        body: 'Body',
        createdBy: ACTOR,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('throws Zod error for invalid expiresAt format', async () => {
    const pool = makePool([ok([])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    await expect(
      svc.create({
        organizationId: ORG,
        title: 'Update',
        body: 'Body',
        expiresAt: 'not-a-date',
        createdBy: ACTOR,
        correlationId: CORR,
      }),
    ).rejects.toThrow();
  });

  it('sets tenant context before inserting', async () => {
    const pool = makePool([ok([]), ok([announcementRow()])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    await svc.create({
      organizationId: ORG,
      title: 'Update',
      body: 'Body text',
      createdBy: ACTOR,
      correlationId: CORR,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });
});

// ─── publish ─────────────────────────────────────────────────────────────────

describe('AnnouncementService.publish', () => {
  it('returns announcement with status "published"', async () => {
    const row = announcementRow({ status: 'published', published_by: ACTOR, published_at: NOW });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.publish(ORG, ANN_ID, ACTOR, CORR);
    expect(result.status).toBe('published');
    expect(result.publishedBy).toBe(ACTOR);
  });

  it('publishes announcement.published event', async () => {
    const row = announcementRow({ status: 'published', published_by: ACTOR, published_at: NOW });
    const pool = makePool([ok([]), ok([row])]);
    const ep = makeEventPublisher();
    const svc = new AnnouncementService(pool, ep, makeAuditService());
    await svc.publish(ORG, ANN_ID, ACTOR, CORR);
    expect(ep.publish).toHaveBeenCalledOnce();
    expect(ep.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'announcement.published' }),
    );
  });

  it('records audit entry with action announcement.published', async () => {
    const row = announcementRow({ status: 'published', published_by: ACTOR, published_at: NOW });
    const pool = makePool([ok([]), ok([row])]);
    const audit = makeAuditService();
    const svc = new AnnouncementService(pool, makeEventPublisher(), audit);
    await svc.publish(ORG, ANN_ID, ACTOR, CORR);
    expect(audit.record).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'announcement.published' }),
    );
  });

  it('throws when UPDATE RETURNING returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    await expect(svc.publish(ORG, 'nonexistent', ACTOR, CORR)).rejects.toThrow(
      'UPDATE RETURNING returned no row',
    );
  });
});

// ─── archive ─────────────────────────────────────────────────────────────────

describe('AnnouncementService.archive', () => {
  it('returns announcement with status "archived"', async () => {
    const row = announcementRow({ status: 'archived' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.archive(ORG, ANN_ID, ACTOR, CORR);
    expect(result.status).toBe('archived');
  });

  it('records audit entry with action announcement.archived', async () => {
    const row = announcementRow({ status: 'archived' });
    const pool = makePool([ok([]), ok([row])]);
    const audit = makeAuditService();
    const svc = new AnnouncementService(pool, makeEventPublisher(), audit);
    await svc.archive(ORG, ANN_ID, ACTOR, CORR);
    expect(audit.record).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'announcement.archived' }),
    );
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe('AnnouncementService.getById', () => {
  it('returns announcement when found', async () => {
    const pool = makePool([ok([]), ok([announcementRow()])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, ANN_ID);
    expect(result).toMatchObject({ id: ANN_ID, organizationId: ORG, status: 'draft' });
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.getById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ─── list ────────────────────────────────────────────────────────────────────

describe('AnnouncementService.list', () => {
  it('returns all announcements for the organization', async () => {
    const rows = [
      announcementRow({ id: 'a1', status: 'draft' }),
      announcementRow({ id: 'a2', status: 'published' }),
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.list(ORG);
    expect(result).toHaveLength(2);
    expect(result).toMatchObject([{ id: 'a1' }, { id: 'a2' }]);
  });

  it('returns empty array when no announcements exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new AnnouncementService(pool, makeEventPublisher(), makeAuditService());
    const result = await svc.list(ORG);
    expect(result).toEqual([]);
  });
});
