import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageMeteringService } from '../usage/UsageMeteringService.js';
import type { Pool, QueryResult } from 'pg';

function makePool(rows: unknown[][]): Pool {
  let callIdx = 0;
  const query = vi.fn().mockImplementation(() => {
    const currentRows = rows[callIdx] ?? [];
    callIdx++;
    return Promise.resolve({ rows: currentRows, rowCount: currentRows.length } as QueryResult);
  });
  return { query } as unknown as Pool;
}

const usageEventRow = {
  id: 'evt-1',
  organization_id: 'org-1',
  subscription_id: 'sub-1',
  event_type: 'workflow_run',
  quantity: 5,
  metadata: {},
  recorded_at: '2024-01-15',
};

describe('UsageMeteringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordUsage inserts and returns usage event', async () => {
    const pool = makePool([
      [], // set_config
      [usageEventRow], // INSERT usage_events
    ]);
    const svc = new UsageMeteringService(pool);
    const event = await svc.recordUsage({
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      eventType: 'workflow_run',
      quantity: 5,
    });
    expect(event.id).toBe('evt-1');
    expect(event.quantity).toBe(5);
    expect(event.eventType).toBe('workflow_run');
  });

  it('getUsageSummary aggregates usage by period', async () => {
    const pool = makePool([
      [], // set_config
      [
        {
          workflow_runs: '10',
          agent_executions: '3',
          api_calls: '100',
          storage_mb: '50',
          member_seats: '5',
        },
      ],
    ]);
    const svc = new UsageMeteringService(pool);
    const summary = await svc.getUsageSummary('org-1', 'sub-1', {
      start: '2024-01-01',
      end: '2024-01-31',
    });
    expect(summary.workflowRuns).toBe(10);
    expect(summary.agentExecutions).toBe(3);
    expect(summary.apiCalls).toBe(100);
  });

  it('recordUsage with metadata stores metadata', async () => {
    const rowWithMeta = { ...usageEventRow, metadata: { source: 'api' } };
    const pool = makePool([[], [rowWithMeta]]);
    const svc = new UsageMeteringService(pool);
    const event = await svc.recordUsage({
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      eventType: 'api_call',
      quantity: 1,
      metadata: { source: 'api' },
    });
    expect(event.metadata).toEqual({ source: 'api' });
  });
});
