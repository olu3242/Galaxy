import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Pool, PoolClient, QueryResult } from 'pg';

const mocks = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  queueAdd: vi.fn(),
  discover: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mocks.anthropicCreate },
  })),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({ add: mocks.queueAdd })),
  };
});

vi.mock('@galaxy/communication', () => ({
  WhatsAppProvider: vi.fn().mockImplementation(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@galaxy/events', () => ({
  EventPublisher: vi.fn().mockImplementation(() => ({ publish: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@galaxy/identity', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({ insert: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('../../lib/workflow-dispatch.js', () => ({
  discoverWorkflowForTrigger: mocks.discover,
}));

import { createIntentProcessor } from '../intent-detection.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const WORKFLOW = '00000000-0000-0000-0000-000000000002';
const RUN = '00000000-0000-0000-0000-000000000003';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(): Pool {
  const query = vi.fn(async (sql: string): Promise<QueryResult<object>> => {
    if (sql.includes('INSERT INTO workflow_runs')) return ok([{ id: RUN }]);
    return ok([]);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue(ok([])),
  } as unknown as Pool;
}

function makeJob(): Job {
  return {
    id: 'intent-job-1',
    name: 'detect-intent',
    data: {
      rawInput: 'I need Friday off',
      organizationId: ORG,
      sourceType: 'api',
      sourceId: 'request-1',
      correlationId: '00000000-0000-0000-0000-000000000099',
    },
  } as unknown as Job;
}

describe('intent-detection trigger convergence', () => {
  it('routes a high-confidence API intent through canonical workflow discovery', async () => {
    mocks.anthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            detectedIntent: 'leave_request',
            automationDomain: 'hr',
            flowType: 'ai_flow',
            confidence: 0.98,
          }),
        },
      ],
    });
    mocks.discover.mockResolvedValue({
      workflowId: WORKFLOW,
      score: 95,
      reasons: ['trigger:api:leave'],
      request: { source: 'api' },
    });
    mocks.queueAdd.mockResolvedValue({ id: 'workflow-job-1' });

    await createIntentProcessor(makePool(), 'test-key')(makeJob());

    expect(mocks.discover).toHaveBeenCalledOnce();
    expect(mocks.discover).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        sourceType: 'api',
        intent: 'leave_request',
        automationDomain: 'hr',
        flowType: 'ai_flow',
        correlationId: '00000000-0000-0000-0000-000000000099',
      }),
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'start-workflow',
      expect.objectContaining({
        organizationId: ORG,
        runId: RUN,
        correlationId: '00000000-0000-0000-0000-000000000099',
      }),
    );
  });
});
