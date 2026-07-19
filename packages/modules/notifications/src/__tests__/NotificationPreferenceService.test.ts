/**
 * NotificationPreferenceService unit tests
 *
 * Covers: get · upsert · listForMember
 *
 * All DB calls are mocked — no real database.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { NotificationPreferenceService } from '../services/NotificationPreferenceService.js';
import type { NotificationPreferenceRow } from '../types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const MEMBER_ID = '00000000-0000-0000-0000-000000000020';
const PREF_ID = '00000000-0000-0000-0000-000000000030';
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

function prefRow(overrides: Partial<NotificationPreferenceRow> = {}): NotificationPreferenceRow {
  return {
    id: PREF_ID,
    organization_id: ORG,
    member_id: MEMBER_ID,
    channel: 'in_app',
    notification_type: 'workflow.submitted',
    is_enabled: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─── get ─────────────────────────────────────────────────────────────────────

describe('NotificationPreferenceService.get', () => {
  it('returns the preference when found', async () => {
    const row = prefRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.get(ORG, MEMBER_ID, 'in_app', 'workflow.submitted');
    expect(result).not.toBeNull();
    expect(result?.id).toBe(PREF_ID);
    expect(result?.isEnabled).toBe(true);
  });

  it('returns null when no preference record exists', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.get(ORG, MEMBER_ID, 'in_app', 'workflow.submitted');
    expect(result).toBeNull();
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationPreferenceService(pool);

    await svc.get(ORG, MEMBER_ID, 'in_app', 'workflow.submitted');

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });

  it('maps all fields from the row', async () => {
    const row = prefRow({ channel: 'email', notification_type: 'report.ready', is_enabled: false });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.get(ORG, MEMBER_ID, 'email', 'report.ready');
    expect(result?.channel).toBe('email');
    expect(result?.notificationType).toBe('report.ready');
    expect(result?.isEnabled).toBe(false);
    expect(result?.memberId).toBe(MEMBER_ID);
  });
});

// ─── upsert ──────────────────────────────────────────────────────────────────

describe('NotificationPreferenceService.upsert', () => {
  it('sets tenant context then returns the upserted preference', async () => {
    const row = prefRow({ is_enabled: false });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.upsert({
      organizationId: ORG,
      memberId: MEMBER_ID,
      channel: 'in_app',
      notificationType: 'workflow.submitted',
      isEnabled: false,
    });

    expect(result.isEnabled).toBe(false);
    expect(result.organizationId).toBe(ORG);

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });

  it('enables a preference', async () => {
    const row = prefRow({ is_enabled: true });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.upsert({
      organizationId: ORG,
      memberId: MEMBER_ID,
      channel: 'email',
      notificationType: 'report.ready',
      isEnabled: true,
    });

    expect(result.isEnabled).toBe(true);
  });

  it('throws when INSERT RETURNING returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationPreferenceService(pool);

    await expect(
      svc.upsert({
        organizationId: ORG,
        memberId: MEMBER_ID,
        channel: 'in_app',
        notificationType: 'workflow.submitted',
        isEnabled: true,
      }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });
});

// ─── listForMember ────────────────────────────────────────────────────────────

describe('NotificationPreferenceService.listForMember', () => {
  it('returns all preferences for a member', async () => {
    const rows = [
      prefRow({ channel: 'in_app', notification_type: 'workflow.submitted' }),
      prefRow({
        id: '00000000-0000-0000-0000-000000000031',
        channel: 'email',
        notification_type: 'report.ready',
      }),
    ];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.listForMember(ORG, MEMBER_ID);
    expect(result).toHaveLength(2);
    expect(result[0]?.channel).toBe('in_app');
    expect(result[1]?.channel).toBe('email');
  });

  it('returns empty array when member has no preferences', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationPreferenceService(pool);

    const result = await svc.listForMember(ORG, MEMBER_ID);
    expect(result).toEqual([]);
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationPreferenceService(pool);

    await svc.listForMember(ORG, MEMBER_ID);

    expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });
});
