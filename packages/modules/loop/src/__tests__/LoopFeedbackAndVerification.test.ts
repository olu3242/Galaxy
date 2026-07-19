/**
 * Loop OS — LoopFeedbackService · LoopVerificationService · LoopInstanceService
 *
 * Covers: submit feedback · listByLoop · getAverageScore ·
 *         submit verification · listByLoop(verification) · getLatest ·
 *         create loop instance · getById · listByWorkflow · startVerification
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult, PoolClient } from 'pg';
import { LoopFeedbackService } from '../services/LoopFeedbackService.js';
import { LoopVerificationService } from '../services/LoopVerificationService.js';
import { LoopInstanceService } from '../services/LoopInstanceService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const LOOP_ID = '00000000-0000-0000-0000-000000000010';
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000020';
const MEMBER_ID = '00000000-0000-0000-0000-000000000030';
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

function makePoolWithClient(
  clientResponses: QueryResult[],
  poolResponses: QueryResult[] = [],
): Pool {
  let poolCall = 0;
  let clientCall = 0;

  const client = {
    query: vi.fn(() => {
      const resp = clientResponses[clientCall] ?? ok([]);
      clientCall++;
      return Promise.resolve(resp);
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return {
    query: vi.fn(() => {
      const resp = poolResponses[poolCall] ?? ok([]);
      poolCall++;
      return Promise.resolve(resp);
    }),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

function feedbackRow() {
  return {
    id: '00000000-0000-0000-0000-000000000050',
    loop_instance_id: LOOP_ID,
    submitted_by: MEMBER_ID,
    score: 4,
    comment: 'Good workflow',
    submitted_at: NOW,
  };
}

function verificationRow() {
  return {
    id: '00000000-0000-0000-0000-000000000060',
    loop_instance_id: LOOP_ID,
    verified_by: MEMBER_ID,
    status: 'confirmed',
    notes: 'Task completed as expected',
    evidence_urls: ['https://cdn.example.com/photo.jpg'],
    verified_at: NOW,
    created_at: NOW,
  };
}

function loopRow() {
  return {
    id: LOOP_ID,
    organization_id: ORG,
    workflow_instance_id: WORKFLOW_ID,
    status: 'pending',
    verification_deadline: NOW,
    feedback_deadline: null,
    verification_count: 0,
    feedback_score: null,
    outcome_notes: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

// ─── LoopFeedbackService ──────────────────────────────────────────────────────

describe('LoopFeedbackService.submit', () => {
  it('returns a LoopFeedback with correct fields', async () => {
    const pool = makePoolWithClient([
      ok([]), // BEGIN
      ok([feedbackRow()]), // INSERT loop_feedback
      ok([]), // UPDATE loop_instances
      ok([]), // COMMIT
    ]);
    const svc = new LoopFeedbackService(pool);
    const result = await svc.submit(
      { loopInstanceId: LOOP_ID, submittedBy: MEMBER_ID, score: 4, comment: 'Good workflow' },
      ORG,
    );

    expect(result.loopInstanceId).toBe(LOOP_ID);
    expect(result.submittedBy).toBe(MEMBER_ID);
    expect(result.score).toBe(4);
    expect(result.comment).toBe('Good workflow');
  });

  it('rolls back and rethrows on error', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(ok([]))
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue(ok([])),
      release: vi.fn(),
    } as unknown as PoolClient;

    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    const svc = new LoopFeedbackService(pool);
    await expect(
      svc.submit({ loopInstanceId: LOOP_ID, submittedBy: MEMBER_ID, score: 3 }, ORG),
    ).rejects.toThrow('DB error');

    expect(client.release).toHaveBeenCalled();
  });
});

describe('LoopFeedbackService.listByLoop', () => {
  it('returns all feedback for a loop instance', async () => {
    const pool = makePool([ok([feedbackRow(), feedbackRow()])]);
    const svc = new LoopFeedbackService(pool);
    const result = await svc.listByLoop(LOOP_ID, ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.loopInstanceId).toBe(LOOP_ID);
  });

  it('returns empty array when no feedback', async () => {
    const pool = makePool([ok([])]);
    const svc = new LoopFeedbackService(pool);
    const result = await svc.listByLoop(LOOP_ID, ORG);
    expect(result).toEqual([]);
  });
});

describe('LoopFeedbackService.getAverageScore', () => {
  it('returns numeric average when feedback exists', async () => {
    const pool = makePool([ok([{ avg_score: '4.25' }])]);
    const svc = new LoopFeedbackService(pool);
    const result = await svc.getAverageScore(LOOP_ID, ORG);
    expect(result).toBe(4.25);
  });

  it('returns null when no feedback has been submitted', async () => {
    const pool = makePool([ok([{ avg_score: null }])]);
    const svc = new LoopFeedbackService(pool);
    const result = await svc.getAverageScore(LOOP_ID, ORG);
    expect(result).toBeNull();
  });
});

// ─── LoopVerificationService ──────────────────────────────────────────────────

describe('LoopVerificationService.submit', () => {
  it('returns a LoopVerification with status confirmed', async () => {
    const pool = makePoolWithClient([
      ok([]), // BEGIN
      ok([verificationRow()]), // INSERT
      ok([]), // UPDATE loop_instances
      ok([]), // COMMIT
    ]);
    const svc = new LoopVerificationService(pool);
    const result = await svc.submit(
      {
        loopInstanceId: LOOP_ID,
        verifiedBy: MEMBER_ID,
        status: 'confirmed',
        notes: 'Verified',
        evidenceUrls: ['https://cdn.example.com/photo.jpg'],
      },
      ORG,
    );

    expect(result.loopInstanceId).toBe(LOOP_ID);
    expect(result.status).toBe('confirmed');
    expect(result.evidenceUrls).toHaveLength(1);
  });

  it('rolls back on error and rethrows', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(ok([]))
        .mockRejectedValueOnce(new Error('insert failed'))
        .mockResolvedValue(ok([])),
      release: vi.fn(),
    } as unknown as PoolClient;

    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const svc = new LoopVerificationService(pool);
    await expect(
      svc.submit({ loopInstanceId: LOOP_ID, verifiedBy: MEMBER_ID, status: 'rejected' }, ORG),
    ).rejects.toThrow('insert failed');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('LoopVerificationService.listByLoop', () => {
  it('returns verifications for a loop instance', async () => {
    const pool = makePool([ok([verificationRow()])]);
    const svc = new LoopVerificationService(pool);
    const result = await svc.listByLoop(LOOP_ID, ORG);
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('confirmed');
  });
});

describe('LoopVerificationService.getLatest', () => {
  it('returns latest verification', async () => {
    const pool = makePool([ok([verificationRow()])]);
    const svc = new LoopVerificationService(pool);
    const result = await svc.getLatest(LOOP_ID, ORG);
    expect(result).not.toBeNull();
    expect(result?.verifiedBy).toBe(MEMBER_ID);
  });

  it('returns null when no verifications', async () => {
    const pool = makePool([ok([])]);
    const svc = new LoopVerificationService(pool);
    const result = await svc.getLatest(LOOP_ID, ORG);
    expect(result).toBeNull();
  });
});

// ─── LoopInstanceService ──────────────────────────────────────────────────────

describe('LoopInstanceService.create', () => {
  it('returns a new LoopInstance with pending status', async () => {
    const pool = makePool([ok([loopRow()])]);
    const svc = new LoopInstanceService(pool);
    const result = await svc.create({
      organizationId: ORG,
      workflowInstanceId: WORKFLOW_ID,
    });

    expect(result.id).toBe(LOOP_ID);
    expect(result.status).toBe('pending');
    expect(result.organizationId).toBe(ORG);
  });

  it('uses custom verificationDeadlineHours when provided', async () => {
    const pool = makePool([ok([loopRow()])]);
    const svc = new LoopInstanceService(pool);
    await svc.create({
      organizationId: ORG,
      workflowInstanceId: WORKFLOW_ID,
      verificationDeadlineHours: 48,
    });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[1]).toContain(48);
  });
});

describe('LoopInstanceService.getById', () => {
  it('returns LoopInstance when found', async () => {
    const pool = makePool([ok([loopRow()])]);
    const svc = new LoopInstanceService(pool);
    const result = await svc.getById(LOOP_ID, ORG);
    expect(result?.id).toBe(LOOP_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([])]);
    const svc = new LoopInstanceService(pool);
    const result = await svc.getById('nonexistent', ORG);
    expect(result).toBeNull();
  });
});

describe('LoopInstanceService.listByWorkflow', () => {
  it('returns all loop instances for a workflow', async () => {
    const pool = makePool([ok([loopRow(), loopRow()])]);
    const svc = new LoopInstanceService(pool);
    const result = await svc.listByWorkflow(WORKFLOW_ID, ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no instances', async () => {
    const pool = makePool([ok([])]);
    const svc = new LoopInstanceService(pool);
    const result = await svc.listByWorkflow(WORKFLOW_ID, ORG);
    expect(result).toEqual([]);
  });
});

describe('LoopInstanceService.startVerification', () => {
  it('returns instance with verifying status', async () => {
    const verifyingRow = { ...loopRow(), status: 'verifying' };
    const pool = makePool([ok([verifyingRow])]);
    const svc = new LoopInstanceService(pool);
    const result = await svc.startVerification(LOOP_ID, ORG);
    expect(result.status).toBe('verifying');
  });

  it('passes org and id to the UPDATE query', async () => {
    const verifyingRow = { ...loopRow(), status: 'verifying' };
    const pool = makePool([ok([verifyingRow])]);
    const svc = new LoopInstanceService(pool);
    await svc.startVerification(LOOP_ID, ORG);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[0] as [string, unknown[]])[1];
    expect(params).toContain(LOOP_ID);
    expect(params).toContain(ORG);
  });
});
