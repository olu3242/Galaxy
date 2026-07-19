import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { WorkflowDiscoveryService } from '../WorkflowDiscoveryService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const WF_ID = '00000000-0000-0000-0000-000000000010';
const INTENT_ID = '00000000-0000-0000-0000-000000000020';

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

function wfRow() {
  return {
    id: WF_ID,
    organization_id: ORG,
    name: 'Onboard Member',
    description: null,
    version: 1,
    is_active: true,
    automation_domain: 'membership',
    flow_type: 'automated',
    definition: {},
    tags: [],
    owner_id: null,
    department_id: null,
    sla_duration_hours: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function intentRow() {
  return {
    id: INTENT_ID,
    organization_id: ORG,
    source_type: 'whatsapp',
    source_id: null,
    raw_input: 'onboard new member',
    detected_intent: 'onboard_member',
    automation_domain: 'membership',
    flow_type: null,
    matched_workflow_id: WF_ID,
    workflow_run_id: null,
    confidence_score: '0.92',
    requires_human_review: false,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('WorkflowDiscoveryService.discoverWorkflow', () => {
  it('returns matched workflow when found by intent', async () => {
    // discoverWorkflow: setTenantContext + fuzzy search + setTenantContext + getWorkflow
    const pool = makePool([ok([]), ok([{ id: WF_ID }]), ok([]), ok([wfRow()])]);
    const svc = new WorkflowDiscoveryService(pool);
    const result = await svc.discoverWorkflow(ORG, 'onboard');
    expect(result?.id).toBe(WF_ID);
  });

  it('returns null when no workflow matches', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDiscoveryService(pool);
    const result = await svc.discoverWorkflow(ORG, 'nonexistent intent');
    expect(result).toBeNull();
  });

  it('passes domain filter when provided', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDiscoveryService(pool);
    await svc.discoverWorkflow(ORG, 'task', 'task');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const searchParams = calls[1]?.[1] ?? [];
    expect(searchParams).toContain('task');
  });
});

describe('WorkflowDiscoveryService.recordIntentDetection', () => {
  it('sets tenant context before insert', async () => {
    const pool = makePool([ok([]), ok([intentRow()])]);
    const svc = new WorkflowDiscoveryService(pool);
    await svc.recordIntentDetection({
      organizationId: ORG,
      sourceType: 'whatsapp',
      rawInput: 'onboard new member',
      detectedIntent: 'onboard_member',
      requiresHumanReview: false,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns mapped IntentDetection on success', async () => {
    const pool = makePool([ok([]), ok([intentRow()])]);
    const svc = new WorkflowDiscoveryService(pool);
    const result = await svc.recordIntentDetection({
      organizationId: ORG,
      sourceType: 'whatsapp',
      rawInput: 'onboard new member',
      detectedIntent: 'onboard_member',
      requiresHumanReview: false,
    });
    expect(result.id).toBe(INTENT_ID);
    expect(result.organizationId).toBe(ORG);
    expect(result.detectedIntent).toBe('onboard_member');
    expect(result.requiresHumanReview).toBe(false);
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new WorkflowDiscoveryService(pool);
    await expect(
      svc.recordIntentDetection({
        organizationId: ORG,
        sourceType: 'whatsapp',
        rawInput: 'x',
        detectedIntent: 'x',
        requiresHumanReview: false,
      }),
    ).rejects.toThrow();
  });

  it('includes confidenceScore in params when provided', async () => {
    const pool = makePool([ok([]), ok([intentRow()])]);
    const svc = new WorkflowDiscoveryService(pool);
    await svc.recordIntentDetection({
      organizationId: ORG,
      sourceType: 'whatsapp',
      rawInput: 'x',
      detectedIntent: 'x',
      requiresHumanReview: false,
      confidenceScore: 0.95,
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const params = calls[1]?.[1] ?? [];
    expect(params).toContain(0.95);
  });
});
