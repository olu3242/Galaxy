import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { GxGovernanceEngine } from '../GxGovernanceEngine.js';
import type { GovernanceCheckInput } from '../GxGovernanceEngine.js';

const ORG = '00000000-0000-0000-0000-000000000005';
const ACTOR = 'actor-gov-001';
const GOV_AGENT = 'agent-gov-001';

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

const baseInput: GovernanceCheckInput = {
  organizationId: ORG,
  actorId: ACTOR,
  agentId: GOV_AGENT,
  action: 'read',
  resourceType: 'report',
};

describe('GxGovernanceEngine.evaluate', () => {
  it('sets tenant context as first query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxGovernanceEngine(pool);
    await engine.evaluate(baseInput);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
  });

  it('returns allowed=true for a low-tier read action', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxGovernanceEngine(pool);
    const decision = await engine.evaluate({ ...baseInput, impactTier: 1 });
    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('low');
    expect(decision.humanApprovalRequired).toBe(false);
  });

  it('requires human approval for tier 4+', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxGovernanceEngine(pool);
    const decision = await engine.evaluate({ ...baseInput, impactTier: 4 });
    expect(decision.humanApprovalRequired).toBe(true);
    expect(decision.auditRequired).toBe(true);
  });

  it('marks high-risk actions as requiring human approval regardless of tier', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxGovernanceEngine(pool);
    const decision = await engine.evaluate({ ...baseInput, action: 'delete', impactTier: 1 });
    expect(decision.humanApprovalRequired).toBe(true);
    expect(decision.riskLevel).toBe('high');
  });

  it('includes active enforce-mode policy IDs', async () => {
    const policyRows = [
      { id: 'pol-1', enforcement_mode: 'enforce', rules: [] },
      { id: 'pol-2', enforcement_mode: 'monitor', rules: [] },
    ];
    const pool = makePool([ok([]), ok(policyRows)]);
    const engine = new GxGovernanceEngine(pool);
    const decision = await engine.evaluate(baseInput);
    expect(decision.policyIds).toContain('pol-1');
    expect(decision.policyIds).not.toContain('pol-2');
  });
});

describe('GxGovernanceEngine.logDecision', () => {
  it('sets tenant context and inserts governance log', async () => {
    const pool = makePool([ok([]), ok([])]);
    const engine = new GxGovernanceEngine(pool);
    await engine.logDecision(
      ORG,
      GOV_AGENT,
      'read',
      {
        allowed: true,
        reason: 'ok',
        policyIds: [],
        auditRequired: false,
        humanApprovalRequired: false,
        riskLevel: 'low',
      },
      'corr-1',
    );
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain('INSERT INTO agent_governance_log');
  });
});
