/**
 * Integration OS — IntegrationConnectorService unit tests
 *
 * Covers: registerConnector · enableConnector · disableConnector · listConnectors · getConnector
 *
 * All DB calls are mocked via a pool stub; no real database required.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { IntegrationConnectorService } from '../connectors/IntegrationConnectorService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const CONNECTOR_ID = '00000000-0000-0000-0000-000000000010';
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

function connectorRow(overrides: Partial<{ status: string; connector_type: string }> = {}) {
  return {
    id: CONNECTOR_ID,
    organization_id: ORG,
    name: 'Slack Webhook',
    connector_type: overrides.connector_type ?? 'webhook',
    status: overrides.status ?? 'inactive',
    config: { url: 'https://hooks.slack.com/xxx' },
    credentials: {},
    last_sync_at: null,
    created_at: NOW,
  };
}

// ─── registerConnector ───────────────────────────────────────────────────────

describe('IntegrationConnectorService.registerConnector', () => {
  it('returns a typed connector with inactive status on creation', async () => {
    const pool = makePool([ok([]), ok([connectorRow({ status: 'inactive' })])]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.registerConnector({
      organizationId: ORG,
      name: 'Slack Webhook',
      connectorType: 'webhook',
      config: { url: 'https://hooks.slack.com/xxx' },
      credentials: {},
    });
    expect(result).toMatchObject({
      id: CONNECTOR_ID,
      organizationId: ORG,
      name: 'Slack Webhook',
      connectorType: 'webhook',
      status: 'inactive',
    });
  });

  it('sets tenant context before INSERT', async () => {
    const pool = makePool([ok([]), ok([connectorRow()])]);
    const svc = new IntegrationConnectorService(pool);
    await svc.registerConnector({
      organizationId: ORG,
      name: 'Slack Webhook',
      connectorType: 'webhook',
      config: {},
      credentials: {},
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const [sql, params] = calls[0] ?? ['', []];
    expect(sql).toBe('SELECT set_config($1, $2, true)');
    expect(params[1]).toBe(ORG);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationConnectorService(pool);
    await expect(
      svc.registerConnector({
        organizationId: ORG,
        name: 'Broken',
        connectorType: 'api',
        config: {},
        credentials: {},
      }),
    ).rejects.toThrow('Failed to create connector');
  });

  it('passes all fields to parameterized INSERT query', async () => {
    const pool = makePool([ok([]), ok([connectorRow()])]);
    const svc = new IntegrationConnectorService(pool);
    await svc.registerConnector({
      organizationId: ORG,
      name: 'My API',
      connectorType: 'api',
      config: { baseUrl: 'https://api.example.com' },
      credentials: { apiKey: 'secret' },
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const [sql, params] = calls[1] ?? ['', []];
    expect(sql).toMatch(/INSERT INTO integration_connectors/i);
    expect(params[0]).toBe(ORG);
    expect(params[1]).toBe('My API');
    expect(params[2]).toBe('api');
    // No raw string interpolation — values in params
    expect(sql).not.toContain(ORG);
  });
});

// ─── enableConnector ─────────────────────────────────────────────────────────

describe('IntegrationConnectorService.enableConnector', () => {
  it('returns connector with active status', async () => {
    const pool = makePool([ok([]), ok([connectorRow({ status: 'active' })])]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.enableConnector(ORG, CONNECTOR_ID);
    expect(result.status).toBe('active');
    expect(result.id).toBe(CONNECTOR_ID);
  });

  it('throws when connector not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationConnectorService(pool);
    await expect(svc.enableConnector(ORG, 'nonexistent')).rejects.toThrow('Connector not found');
  });

  it('scopes UPDATE to org and connector id', async () => {
    const pool = makePool([ok([]), ok([connectorRow({ status: 'active' })])]);
    const svc = new IntegrationConnectorService(pool);
    await svc.enableConnector(ORG, CONNECTOR_ID);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const updateParams = calls[1]?.[1] ?? [];
    expect(updateParams).toContain(CONNECTOR_ID);
    expect(updateParams).toContain(ORG);
  });
});

// ─── disableConnector ────────────────────────────────────────────────────────

describe('IntegrationConnectorService.disableConnector', () => {
  it('returns connector with inactive status', async () => {
    const pool = makePool([ok([]), ok([connectorRow({ status: 'inactive' })])]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.disableConnector(ORG, CONNECTOR_ID);
    expect(result.status).toBe('inactive');
  });

  it('throws when connector not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationConnectorService(pool);
    await expect(svc.disableConnector(ORG, 'nonexistent')).rejects.toThrow('Connector not found');
  });
});

// ─── listConnectors ───────────────────────────────────────────────────────────

describe('IntegrationConnectorService.listConnectors', () => {
  it('returns all connectors for org', async () => {
    const rows = [connectorRow({ status: 'active' }), connectorRow({ status: 'inactive' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.listConnectors(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ organizationId: ORG });
  });

  it('returns empty array when no connectors', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.listConnectors(ORG);
    expect(result).toEqual([]);
  });

  it('queries scoped to the organization', async () => {
    const pool = makePool([ok([]), ok([connectorRow({ connector_type: 'webhook' })])]);
    const svc = new IntegrationConnectorService(pool);
    await svc.listConnectors(ORG);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain(ORG);
  });
});

// ─── getConnector ─────────────────────────────────────────────────────────────

describe('IntegrationConnectorService.getConnector', () => {
  it('returns connector when found', async () => {
    const pool = makePool([ok([]), ok([connectorRow()])]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.getConnector(ORG, CONNECTOR_ID);
    expect(result).toMatchObject({ id: CONNECTOR_ID, organizationId: ORG });
  });

  it('returns undefined when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationConnectorService(pool);
    const result = await svc.getConnector(ORG, 'nonexistent');
    expect(result).toBeUndefined();
  });
});
