import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { OrgDiscoveryService, DISCOVERY_QUESTIONS } from '../discovery/OrgDiscoveryService.js';

const ORG = '00000000-0000-0000-0000-000000000006';
const SESSION_ID = 'session-1';

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

const makeSessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  organization_id: ORG,
  current_step: 0,
  total_steps: DISCOVERY_QUESTIONS.length,
  responses: {} as Record<string, unknown>,
  generated_structure: null,
  status: 'in_progress',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
});

describe('OrgDiscoveryService.startSession', () => {
  it('sets tenant context and inserts session with correct total steps', async () => {
    const row = makeSessionRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDiscoveryService(pool);
    const result = await svc.startSession(ORG);
    expect(result.id).toBe(SESSION_ID);
    expect(result.totalSteps).toBe(DISCOVERY_QUESTIONS.length);
    expect(result.currentStep).toBe(0);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[1]).toContain(DISCOVERY_QUESTIONS.length);
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgDiscoveryService(pool);
    await expect(svc.startSession(ORG)).rejects.toThrow('Failed to create discovery session');
  });
});

describe('OrgDiscoveryService.getSession', () => {
  it('returns session when found', async () => {
    const row = makeSessionRow({ current_step: 2 });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDiscoveryService(pool);
    const result = await svc.getSession(ORG, SESSION_ID);
    expect(result.currentStep).toBe(2);
  });

  it('throws when session not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new OrgDiscoveryService(pool);
    await expect(svc.getSession(ORG, 'missing')).rejects.toThrow('Discovery session not found');
  });

  it('includes generatedStructure when present', async () => {
    const row = makeSessionRow({ generated_structure: { departments: ['HR'] } });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new OrgDiscoveryService(pool);
    const result = await svc.getSession(ORG, SESSION_ID);
    expect(result.generatedStructure).toEqual({ departments: ['HR'] });
  });
});

describe('OrgDiscoveryService.getNextQuestion', () => {
  it('returns question for current step', () => {
    const svc = new OrgDiscoveryService({} as Pool);
    const session = {
      id: SESSION_ID,
      organizationId: ORG,
      currentStep: 0,
      totalSteps: DISCOVERY_QUESTIONS.length,
      responses: {},
      status: 'in_progress' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(svc.getNextQuestion(session)).toBe(DISCOVERY_QUESTIONS[0]);
  });

  it('returns null when all questions answered', () => {
    const svc = new OrgDiscoveryService({} as Pool);
    const session = {
      id: SESSION_ID,
      organizationId: ORG,
      currentStep: DISCOVERY_QUESTIONS.length,
      totalSteps: DISCOVERY_QUESTIONS.length,
      responses: {},
      status: 'in_progress' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(svc.getNextQuestion(session)).toBeNull();
  });
});

describe('OrgDiscoveryService.answerQuestion — mid session', () => {
  it('records answer and returns next question', async () => {
    const updatedRow = makeSessionRow({ current_step: 1, responses: { '0': 'startup' } });
    // answerQuestion:
    //   call 0: outer setTenantContext
    //   call 1: getSession -> setTenantContext
    //   call 2: getSession -> SELECT
    //   call 3: UPDATE session (not complete)
    const pool = makePool([ok([]), ok([]), ok([makeSessionRow()]), ok([updatedRow])]);
    const svc = new OrgDiscoveryService(pool);
    const result = await svc.answerQuestion(ORG, SESSION_ID, 'startup');
    expect(result.complete).toBe(false);
    expect(result.currentStep).toBe(1);
    expect(result.nextQuestion).toBe(DISCOVERY_QUESTIONS[1]);
  });
});

describe('OrgDiscoveryService.answerQuestion — last question', () => {
  it('marks session complete and generates structure', async () => {
    const lastStep = DISCOVERY_QUESTIONS.length - 1;
    const sessionRow = makeSessionRow({
      current_step: lastStep,
      total_steps: DISCOVERY_QUESTIONS.length,
    });
    const completedRow = makeSessionRow({
      current_step: DISCOVERY_QUESTIONS.length,
      status: 'complete',
      generated_structure: { departments: ['Operations', 'Finance', 'HR'] },
    });
    // call 0: outer setTenant, call 1: getSession setTenant, call 2: getSession SELECT
    // call 3: UPDATE complete
    const pool = makePool([ok([]), ok([]), ok([sessionRow]), ok([completedRow])]);
    const svc = new OrgDiscoveryService(pool);
    const result = await svc.answerQuestion(ORG, SESSION_ID, 'final answer');
    expect(result.complete).toBe(true);
    expect(result.status).toBe('complete');
    expect(result.generatedStructure).toBeDefined();
  });
});
