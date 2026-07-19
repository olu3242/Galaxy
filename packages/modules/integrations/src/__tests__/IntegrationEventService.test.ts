/**
 * Integration OS — IntegrationEventService unit tests
 *
 * Covers: createMapping · listMappings · recordDelivery ·
 *         markDelivered · markFailed
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { IntegrationEventService } from '../events/IntegrationEventService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const CONNECTOR_ID = '00000000-0000-0000-0000-000000000010';
const MAPPING_ID = '00000000-0000-0000-0000-000000000020';
const DELIVERY_ID = '00000000-0000-0000-0000-000000000030';
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

function mappingRow(overrides: Partial<{ is_active: boolean }> = {}) {
  return {
    id: MAPPING_ID,
    organization_id: ORG,
    connector_id: CONNECTOR_ID,
    galaxy_event_type: 'workflow.completed',
    external_event_type: 'task_done',
    transformation_rules: { map: 'id' },
    is_active: overrides.is_active ?? true,
    created_at: NOW,
  };
}

function deliveryRow(overrides: Partial<{ status: string; attempts: string }> = {}) {
  return {
    id: DELIVERY_ID,
    mapping_id: MAPPING_ID,
    organization_id: ORG,
    payload: { event: 'workflow.completed' },
    status: overrides.status ?? 'pending',
    attempts: overrides.attempts ?? '0',
    last_attempt_at: null,
    delivered_at: null,
    created_at: NOW,
  };
}

// ─── createMapping ────────────────────────────────────────────────────────────

describe('IntegrationEventService.createMapping', () => {
  it('sets tenant context before INSERT', async () => {
    const pool = makePool([ok([]), ok([mappingRow()])]);
    const svc = new IntegrationEventService(pool);
    await svc.createMapping({
      organizationId: ORG,
      connectorId: CONNECTOR_ID,
      galaxyEventType: 'workflow.completed',
      externalEventType: 'task_done',
      transformationRules: { map: 'id' },
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0] as [string, unknown[]])[1]).toContain(ORG);
  });

  it('returns mapped EventMapping with correct fields', async () => {
    const pool = makePool([ok([]), ok([mappingRow()])]);
    const svc = new IntegrationEventService(pool);
    const result = await svc.createMapping({
      organizationId: ORG,
      connectorId: CONNECTOR_ID,
      galaxyEventType: 'workflow.completed',
      externalEventType: 'task_done',
      transformationRules: { map: 'id' },
    });

    expect(result.id).toBe(MAPPING_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.connectorId).toBe(CONNECTOR_ID);
    expect(result.galaxyEventType).toBe('workflow.completed');
    expect(result.externalEventType).toBe('task_done');
    expect(result.isActive).toBe(true);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationEventService(pool);
    await expect(
      svc.createMapping({
        organizationId: ORG,
        connectorId: CONNECTOR_ID,
        galaxyEventType: 'x',
        externalEventType: 'y',
        transformationRules: {},
      }),
    ).rejects.toThrow('Failed to create event mapping');
  });
});

// ─── listMappings ─────────────────────────────────────────────────────────────

describe('IntegrationEventService.listMappings', () => {
  it('returns all mappings for connector', async () => {
    const pool = makePool([ok([]), ok([mappingRow(), mappingRow()])]);
    const svc = new IntegrationEventService(pool);
    const result = await svc.listMappings(ORG, CONNECTOR_ID);
    expect(result).toHaveLength(2);
    expect(result[0]?.connectorId).toBe(CONNECTOR_ID);
  });

  it('includes connectorId in query params', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationEventService(pool);
    await svc.listMappings(ORG, CONNECTOR_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(CONNECTOR_ID);
  });

  it('returns empty array when no mappings exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationEventService(pool);
    const result = await svc.listMappings(ORG, CONNECTOR_ID);
    expect(result).toHaveLength(0);
  });
});

// ─── recordDelivery ───────────────────────────────────────────────────────────

describe('IntegrationEventService.recordDelivery', () => {
  it('sets tenant context and inserts with pending status', async () => {
    const pool = makePool([ok([]), ok([deliveryRow()])]);
    const svc = new IntegrationEventService(pool);
    const result = await svc.recordDelivery(ORG, MAPPING_ID, { event: 'workflow.completed' });

    expect(result.id).toBe(DELIVERY_ID);
    expect(result.status).toBe('pending');
    expect(result.attempts).toBe(0);
    expect(result.mappingId).toBe(MAPPING_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationEventService(pool);
    await expect(svc.recordDelivery(ORG, MAPPING_ID, {})).rejects.toThrow(
      'Failed to record delivery',
    );
  });
});

// ─── markDelivered ────────────────────────────────────────────────────────────

describe('IntegrationEventService.markDelivered', () => {
  it('returns delivery with delivered status and incremented attempts', async () => {
    const pool = makePool([ok([]), ok([deliveryRow({ status: 'delivered', attempts: '1' })])]);
    const svc = new IntegrationEventService(pool);
    const result = await svc.markDelivered(ORG, DELIVERY_ID);

    expect(result.status).toBe('delivered');
    expect(result.attempts).toBe(1);
  });

  it('sets tenant context before UPDATE', async () => {
    const pool = makePool([ok([]), ok([deliveryRow({ status: 'delivered', attempts: '1' })])]);
    const svc = new IntegrationEventService(pool);
    await svc.markDelivered(ORG, DELIVERY_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
  });

  it('throws when delivery not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationEventService(pool);
    await expect(svc.markDelivered(ORG, 'ghost')).rejects.toThrow('Delivery not found');
  });
});

// ─── markFailed ───────────────────────────────────────────────────────────────

describe('IntegrationEventService.markFailed', () => {
  it('returns delivery with failed status and incremented attempts', async () => {
    const pool = makePool([ok([]), ok([deliveryRow({ status: 'failed', attempts: '2' })])]);
    const svc = new IntegrationEventService(pool);
    const result = await svc.markFailed(ORG, DELIVERY_ID);

    expect(result.status).toBe('failed');
    expect(result.attempts).toBe(2);
  });

  it('throws when delivery not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new IntegrationEventService(pool);
    await expect(svc.markFailed(ORG, 'ghost')).rejects.toThrow('Delivery not found');
  });

  it('includes deliveryId and orgId in UPDATE params', async () => {
    const pool = makePool([ok([]), ok([deliveryRow({ status: 'failed', attempts: '1' })])]);
    const svc = new IntegrationEventService(pool);
    await svc.markFailed(ORG, DELIVERY_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(DELIVERY_ID);
    expect(params).toContain(ORG);
  });
});
