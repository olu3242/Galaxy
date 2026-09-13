import { describe, expect, it, vi } from 'vitest';
import type { PoolClient, QueryResult } from 'pg';
import { discoverWorkflowForTrigger } from '../workflow-dispatch.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const WORKFLOW = '00000000-0000-0000-0000-000000000002';
const TEMPLATE = '00000000-0000-0000-0000-000000000003';
const INSTANTIATED = '00000000-0000-0000-0000-000000000004';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makeClient(existing: boolean): PoolClient {
  const query = vi.fn((sql: string): Promise<QueryResult<object>> => {
    if (sql.includes('INSERT INTO workflows')) return Promise.resolve(ok([{ id: INSTANTIATED }]));
    if (sql.includes('FROM workflows') && sql.includes('is_active = true')) {
      return Promise.resolve(existing
        ? ok([
            {
              id: WORKFLOW,
              organization_id: ORG,
              name: 'Leave Request',
              description: null,
              version: 2,
              is_active: true,
              automation_domain: 'hr',
              flow_type: 'ai_flow',
              tags: ['leave_request'],
              definition: {},
              created_by: ORG,
              created_at: '2026-09-13T00:00:00.000Z',
              updated_at: '2026-09-13T00:00:00.000Z',
            },
          ])
        : ok([]));
    }
    if (sql.includes('FROM workflow_definitions')) {
      return Promise.resolve(ok([
        {
          id: TEMPLATE,
          name: 'Leave Request',
          description: 'Leave workflow',
          definition: {},
          created_at: '2026-09-13T00:00:00.000Z',
          updated_at: '2026-09-13T00:00:00.000Z',
        },
      ]));
    }
    return Promise.resolve(ok([]));
  });
  return { query } as unknown as PoolClient;
}

const baseInput = {
  organizationId: ORG,
  sourceType: 'whatsapp',
  sourceId: 'wamid-1',
  rawInput: 'I need Friday off',
  intent: 'leave_request',
  automationDomain: 'hr' as const,
  flowType: 'ai_flow' as const,
  correlationId: 'corr-1',
  payload: { senderPhone: '+12105550000' },
};

describe('workflow trigger discovery bridge', () => {
  it('prefers an existing tenant workflow over a global template', async () => {
    const client = makeClient(true);
    const match = await discoverWorkflowForTrigger(client, baseInput);
    if (!match) throw new Error('Expected tenant workflow match');

    expect(match.workflowId).toBe(WORKFLOW);
    expect(match.matchedTemplateId).toBeUndefined();
    expect(match.request.source).toBe('whatsapp');
    expect(match.reasons).toContain('trigger:whatsapp:' + WORKFLOW);
  });

  it('instantiates a matching global template on first use', async () => {
    const client = makeClient(false);
    const match = await discoverWorkflowForTrigger(client, baseInput);
    if (!match) throw new Error('Expected template workflow match');

    expect(match.workflowId).toBe(INSTANTIATED);
    expect(match.matchedTemplateId).toBe(TEMPLATE);
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]?][];
    expect(calls.some(([sql]) => sql.includes('INSERT INTO workflows'))).toBe(true);
    expect(
      calls.some(([, params]) =>
        params?.some(
          (param) =>
            param === 'leave_request' ||
            (Array.isArray(param) && param.includes('leave_request')),
        ) ?? false,
      ),
    ).toBe(true);
  });

  it.each([
    ['api', 'api'],
    ['web', 'web'],
    ['scheduled', 'scheduler'],
    ['scheduler', 'scheduler'],
    ['event', 'event'],
  ])('normalizes %s triggers to %s', async (sourceType, expectedSource) => {
    const client = makeClient(true);
    const match = await discoverWorkflowForTrigger(client, { ...baseInput, sourceType });
    if (!match) throw new Error('Expected normalized workflow match');
    expect(match.request.source).toBe(expectedSource);
  });
});
