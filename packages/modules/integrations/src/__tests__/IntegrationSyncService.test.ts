/**
 * Integration OS — IntegrationSyncService unit tests
 *
 * Covers: triggerSync · completeSyncLog · listSyncLogs
 *
 * All DB calls are mocked via a pool stub; no real database required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { IntegrationSyncService } from '../sync/IntegrationSyncService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const CONNECTOR_ID = '00000000-0000-0000-0000-000000000010';
const SYNC_LOG_ID = '00000000-0000-0000-0000-000000000020';
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

function syncLogRow(
  overrides: Partial<{
    records_synced: string;
    error_count: string;
    completed_at: string | null;
  }> = {},
) {
  return {
    id: SYNC_LOG_ID,
    organization_id: ORG,
    connector_id: CONNECTOR_ID,
    direction: 'inbound',
    records_synced: overrides.records_synced ?? '0',
    error_count: overrides.error_count ?? '0',
    started_at: NOW,
    completed_at: overrides.completed_at ?? null,
  };
}

// ─── triggerSync ─────────────────────────────────────────────────────────────

describe('IntegrationSyncService.triggerSync', () => {
  it('returns a sync log with zero counts on creation', async () => {
    const pool = makePool([ok([]), ok([syncLogRow()])]);
    const svc = new IntegrationSyncService(pool);
    const result = await svc.triggerSync({
      organizationId: ORG,
      connectorId: CONNECTOR_ID,
      direction: 'inbound',
    });
    expect(result).toMatchObject({
      id: SYNC_LOG_ID,
      organizationId: ORG,
      connectorId: CONNECTOR_ID,
      direction: 'inbound',
      recordsSynced: 0,
      errorCount: 0,
    });
  });

  it('sets tenant context before INSERT', async () => {
    const pool = makePool([ok([]), ok([syncLogRow()])]);
    const svc = new IntegrationSyncService(pool);
    await svc.triggerSync({
      organizationId: ORG,
      connectorId: CONNECTOR_ID,
      direction: 'outbound',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationSyncService(pool);
    await expect(
      svc.triggerSync({ organizationId: ORG, connectorId: CONNECTOR_ID, direction: 'inbound' }),
    ).rejects.toThrow('Failed to create sync log');
  });

  it('passes direction to parameterized query', async () => {
    const pool = makePool([ok([]), ok([syncLogRow()])]);
    const svc = new IntegrationSyncService(pool);
    await svc.triggerSync({
      organizationId: ORG,
      connectorId: CONNECTOR_ID,
      direction: 'bidirectional',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain('bidirectional');
    expect(params).toContain(ORG);
    expect(params).toContain(CONNECTOR_ID);
  });
});

// ─── completeSyncLog ─────────────────────────────────────────────────────────

describe('IntegrationSyncService.completeSyncLog', () => {
  it('returns sync log with updated record counts', async () => {
    // calls: set_config · UPDATE sync_log RETURNING · UPDATE connector
    const completed = syncLogRow({ records_synced: '150', error_count: '2', completed_at: NOW });
    const pool = makePool([ok([]), ok([completed]), ok([])]);
    const svc = new IntegrationSyncService(pool);
    const result = await svc.completeSyncLog(ORG, SYNC_LOG_ID, 150, 2);
    expect(result.recordsSynced).toBe(150);
    expect(result.errorCount).toBe(2);
  });

  it('throws when sync log not found', async () => {
    const pool = makePool([ok([]), ok([]), ok([])]);
    const svc = new IntegrationSyncService(pool);
    await expect(svc.completeSyncLog(ORG, 'nonexistent', 0, 0)).rejects.toThrow(
      'Sync log not found',
    );
  });

  it('also updates connector last_sync_at', async () => {
    const completed = syncLogRow({ records_synced: '10', error_count: '0', completed_at: NOW });
    const pool = makePool([ok([]), ok([completed]), ok([])]);
    const svc = new IntegrationSyncService(pool);
    await svc.completeSyncLog(ORG, SYNC_LOG_ID, 10, 0);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    // Third call updates connector
    const [sql] = calls[2] ?? [''];
    expect(sql).toMatch(/UPDATE integration_connectors/i);
    expect(sql).toMatch(/last_sync_at/i);
  });
});

// ─── listSyncLogs ─────────────────────────────────────────────────────────────

describe('IntegrationSyncService.listSyncLogs', () => {
  it('returns all sync logs for a connector', async () => {
    const rows = [syncLogRow({ records_synced: '100' }), syncLogRow({ records_synced: '200' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new IntegrationSyncService(pool);
    const result = await svc.listSyncLogs(ORG, CONNECTOR_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ organizationId: ORG, connectorId: CONNECTOR_ID });
  });

  it('returns empty array when no sync logs exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationSyncService(pool);
    const result = await svc.listSyncLogs(ORG, CONNECTOR_ID);
    expect(result).toEqual([]);
  });

  it('passes limit and offset to parameterized query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationSyncService(pool);
    await svc.listSyncLogs(ORG, CONNECTOR_ID, 25, 50);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain(25);
    expect(params).toContain(50);
  });
});
