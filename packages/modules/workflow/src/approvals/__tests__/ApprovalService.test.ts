import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ApprovalService } from '../ApprovalService.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const APPROVAL_ID = '00000000-0000-0000-0000-000000000010';
const STEP_ID_1 = '00000000-0000-0000-0000-000000000011';
const STEP_ID_2 = '00000000-0000-0000-0000-000000000012';
const APPROVER_ID = '00000000-0000-0000-0000-000000000020';

function makeApprovalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: APPROVAL_ID,
    organization_id: ORG_ID,
    workflow_run_id: null,
    title: 'Leave Request',
    description: null,
    status: 'pending',
    requested_by: 'user-1',
    current_step_order: 1,
    due_at: null,
    completed_at: null,
    data: {},
    correlation_id: 'corr-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePool(responseSequence: unknown[][] = []): Pool {
  let callIndex = 0;
  const query = vi.fn().mockImplementation(() => {
    const rows = responseSequence[callIndex] ?? [];
    callIndex++;
    return Promise.resolve({ rows, rowCount: rows.length } as QueryResult);
  });
  return { query } as unknown as Pool;
}

describe('ApprovalService', () => {
  describe('createApproval', () => {
    it('creates approval and inserts steps', async () => {
      const approvalRow = makeApprovalRow();

      // Calls:
      // 1. set_config
      // 2. INSERT approvals RETURNING
      // 3. INSERT approval_steps (step 1)
      // 4. INSERT approval_steps (step 2)
      // 5. INSERT approval_history
      const pool = makePool([
        [], // set_config
        [approvalRow], // INSERT approvals
        [], // INSERT step 1
        [], // INSERT step 2
        [], // INSERT history
      ]);

      const service = new ApprovalService(pool);
      const result = await service.createApproval({
        organizationId: ORG_ID,
        title: 'Leave Request',
        requestedBy: 'user-1',
        correlationId: 'corr-1',
        steps: [
          { approverId: APPROVER_ID, approverType: 'member' },
          { approverId: 'manager-id', approverType: 'department_head' },
        ],
      });

      expect(result.id).toBe(APPROVAL_ID);
      expect(result.status).toBe('pending');
      expect(result.title).toBe('Leave Request');

      const calls = vi.mocked(pool.query).mock.calls;
      // Should have called insert for 2 steps
      expect(calls).toHaveLength(5);
    });

    it('sets tenant context before inserting', async () => {
      const pool = makePool([[], [makeApprovalRow()], [], []]);

      const service = new ApprovalService(pool);
      await service.createApproval({
        organizationId: ORG_ID,
        title: 'Test',
        requestedBy: 'user-1',
        correlationId: 'corr-1',
        steps: [{ approverId: APPROVER_ID, approverType: 'member' }],
      });

      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG_ID]);
    });
  });

  describe('submitDecision — approved on final step', () => {
    it('sets approval to approved when no pending steps remain', async () => {
      const approvedRow = makeApprovalRow({
        status: 'approved',
        completed_at: '2026-01-01T01:00:00.000Z',
      });

      // Calls:
      // 1. set_config
      // 2. UPDATE approval_steps
      // 3. INSERT approval_decisions
      // 4. SELECT COUNT pending steps → 0
      // 5. UPDATE approvals to approved RETURNING
      // 6. INSERT approval_history
      const pool = makePool([
        [], // set_config
        [], // UPDATE approval_steps
        [], // INSERT approval_decisions
        [{ count: '0' }], // SELECT COUNT pending
        [approvedRow], // UPDATE approvals RETURNING
        [], // INSERT approval_history
      ]);

      const service = new ApprovalService(pool);
      const result = await service.submitDecision({
        organizationId: ORG_ID,
        approvalId: APPROVAL_ID,
        stepId: STEP_ID_1,
        approverId: APPROVER_ID,
        decision: 'approved',
        correlationId: 'corr-1',
      });

      expect(result.status).toBe('approved');
      expect(result.completedAt).toBe('2026-01-01T01:00:00.000Z');
    });

    it('advances step order when more steps remain', async () => {
      const advancedRow = makeApprovalRow({ current_step_order: 2 });

      // COUNT returns 1 (another step pending)
      const pool = makePool([
        [], // set_config
        [], // UPDATE approval_steps
        [], // INSERT approval_decisions
        [{ count: '1' }], // SELECT COUNT pending
        [advancedRow], // UPDATE approvals current_step_order RETURNING
        [], // INSERT approval_history
      ]);

      const service = new ApprovalService(pool);
      const result = await service.submitDecision({
        organizationId: ORG_ID,
        approvalId: APPROVAL_ID,
        stepId: STEP_ID_1,
        approverId: APPROVER_ID,
        decision: 'approved',
        correlationId: 'corr-1',
      });

      expect(result.status).toBe('pending');
      expect(result.currentStepOrder).toBe(2);
    });
  });

  describe('submitDecision — rejected', () => {
    it('sets approval to rejected', async () => {
      const rejectedRow = makeApprovalRow({
        status: 'rejected',
        completed_at: '2026-01-01T01:00:00.000Z',
      });

      // Calls:
      // 1. set_config
      // 2. UPDATE approval_steps
      // 3. INSERT approval_decisions
      // 4. UPDATE approvals to rejected RETURNING
      // 5. INSERT approval_history
      const pool = makePool([
        [], // set_config
        [], // UPDATE approval_steps
        [], // INSERT approval_decisions
        [rejectedRow], // UPDATE approvals RETURNING
        [], // INSERT approval_history
      ]);

      const service = new ApprovalService(pool);
      const result = await service.submitDecision({
        organizationId: ORG_ID,
        approvalId: APPROVAL_ID,
        stepId: STEP_ID_2,
        approverId: APPROVER_ID,
        decision: 'rejected',
        comment: 'Not within policy',
        correlationId: 'corr-1',
      });

      expect(result.status).toBe('rejected');
      expect(result.completedAt).toBe('2026-01-01T01:00:00.000Z');
    });
  });
});
