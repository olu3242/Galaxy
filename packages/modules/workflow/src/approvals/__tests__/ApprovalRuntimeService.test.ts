import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ApprovalRuntimeService } from '../ApprovalRuntimeService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'apr-1',
    organization_id: 'org-1',
    workflow_run_id: 'run-1',
    step_id: 'step-1',
    category: 'finance',
    subject: 'Expense approval',
    description: 'Approve $500 expense',
    requested_by: 'agent-alice',
    assigned_to: ['member-1'],
    amount: 500,
    currency: 'USD',
    deadline: null,
    escalate_to: null,
    status: 'pending',
    decision: null,
    decided_by: null,
    decided_at: null,
    reason: null,
    delegated_to: null,
    escalated_to: null,
    correlation_id: 'corr-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    timeout_at: null,
    ...overrides,
  };
}

function makePool(rows: Record<string, unknown>[] = []): Pool {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult);
  return { query } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApprovalRuntimeService', () => {
  let pool: Pool;
  let service: ApprovalRuntimeService;

  beforeEach(() => {
    pool = makePool();
    service = new ApprovalRuntimeService(pool);
  });

  // ---- request -----------------------------------------------------------

  describe('request()', () => {
    it('inserts approval_request and pauses workflow run', async () => {
      const row = makeRow();
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // INSERT approval_requests
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE workflow_runs

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const result = await service.request({
        organizationId: 'org-1',
        workflowRunId: 'run-1',
        stepId: 'step-1',
        category: 'finance',
        subject: 'Expense approval',
        description: 'Approve $500 expense',
        requestedBy: 'agent-alice',
        assignedTo: ['member-1'],
        amount: 500,
        currency: 'USD',
        correlationId: 'corr-1',
      });

      expect(result.id).toBe('apr-1');
      expect(result.status).toBe('pending');

      // INSERT call
      const insertCall = query.mock.calls[1];
      expect(insertCall?.[0]).toContain('INSERT INTO approval_requests');
      // workflow pause
      const updateCall = query.mock.calls[2];
      expect(updateCall?.[0]).toContain("status = 'waiting'");
    });

    it('throws if INSERT returns no row', async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT returns nothing

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      await expect(
        service.request({
          organizationId: 'org-1',
          workflowRunId: 'run-1',
          stepId: 'step-1',
          category: 'general',
          subject: 'Test',
          description: 'Test desc',
          requestedBy: 'agent-1',
          assignedTo: ['member-1'],
          correlationId: 'corr-1',
        }),
      ).rejects.toThrow('Failed to create approval request');
    });
  });

  // ---- decide ------------------------------------------------------------

  describe('decide()', () => {
    it('approves and resumes workflow run', async () => {
      const row = makeRow();
      const approvedRow = makeRow({ status: 'approved', decision: 'approved', decided_by: 'member-1', decided_at: '2026-01-02T00:00:00Z' });

      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })          // SELECT approval
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // set_config
        .mockResolvedValueOnce({ rows: [approvedRow], rowCount: 1 })  // UPDATE approval
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })              // UPDATE workflow_run
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });             // INSERT audit_log

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const result = await service.decide('apr-1', 'member-1', 'approved');
      expect(result.status).toBe('approved');
      expect(result.decision).toBe('approved');

      // audit log written
      const auditCall = query.mock.calls[4];
      expect(auditCall?.[0]).toContain('INSERT INTO audit_logs');
      expect(auditCall?.[1]).toContain('approval.decided');
    });

    it('rejects if actor is not assigned', async () => {
      const row = makeRow({ assigned_to: ['member-2'] });
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // set_config

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      await expect(service.decide('apr-1', 'member-1', 'approved')).rejects.toThrow(
        'not authorised',
      );
    });

    it('rejects if approval is already decided', async () => {
      const row = makeRow({ status: 'approved' });
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // set_config

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      await expect(service.decide('apr-1', 'member-1', 'rejected')).rejects.toThrow(
        'Cannot decide approval in status',
      );
    });
  });

  // ---- delegate ----------------------------------------------------------

  describe('delegate()', () => {
    it('delegates to a new member and writes audit log', async () => {
      const row = makeRow();
      const delegatedRow = makeRow({ status: 'delegated', delegated_to: 'member-2' });

      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [delegatedRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit_log

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const result = await service.delegate('apr-1', 'member-1', 'member-2', 'Out of office');
      expect(result.status).toBe('delegated');
      expect(result.delegatedTo).toBe('member-2');

      const auditCall = query.mock.calls[3];
      expect(auditCall?.[1]).toContain('approval.delegated');
    });

    it('rejects if actor is not assigned', async () => {
      const row = makeRow({ assigned_to: ['member-99'] });
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      await expect(
        service.delegate('apr-1', 'member-1', 'member-2', 'reason'),
      ).rejects.toThrow('not assigned');
    });
  });

  // ---- escalate ----------------------------------------------------------

  describe('escalate()', () => {
    it('sets status to escalated and writes audit log', async () => {
      const row = makeRow({ escalate_to: 'manager-1' });
      const escalatedRow = makeRow({ status: 'escalated', escalated_to: 'manager-1' });

      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [escalatedRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit_log

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const result = await service.escalate('apr-1', 'SLA breached');
      expect(result.status).toBe('escalated');
      expect(result.escalatedTo).toBe('manager-1');

      const auditCall = query.mock.calls[3];
      expect(auditCall?.[1]).toContain('approval.escalated');
    });
  });

  // ---- processTimeouts ---------------------------------------------------

  describe('processTimeouts()', () => {
    it('marks overdue approvals as timeout and auto-escalates', async () => {
      const overdue = makeRow({ timeout_at: '2026-01-01T00:00:00Z', escalate_to: null });
      const timedOutRow = makeRow({ status: 'timeout' });

      const query = vi.fn()
        // Sweep query
        .mockResolvedValueOnce({ rows: [overdue], rowCount: 1 })
        // set_config for org
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // UPDATE to timeout
        .mockResolvedValueOnce({ rows: [timedOutRow], rowCount: 1 })
        // audit_log for timeout
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const timedOut = await service.processTimeouts();
      expect(timedOut).toHaveLength(1);
      expect(timedOut[0]?.status).toBe('timeout');
    });

    it('returns empty array when no approvals are overdue', async () => {
      const query = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 });
      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const result = await service.processTimeouts();
      expect(result).toHaveLength(0);
    });
  });

  // ---- getPending --------------------------------------------------------

  describe('getPending()', () => {
    it('returns pending approvals assigned to actor', async () => {
      const row = makeRow();
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // set_config
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const results = await service.getPending('org-1', 'member-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('apr-1');
    });
  });

  // ---- getByWorkflowRun --------------------------------------------------

  describe('getByWorkflowRun()', () => {
    it('returns all approvals for a workflow run', async () => {
      const rows = [makeRow(), makeRow({ id: 'apr-2' })];
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows, rowCount: 2 });

      pool = { query } as unknown as Pool;
      service = new ApprovalRuntimeService(pool);

      const results = await service.getByWorkflowRun('org-1', 'run-1');
      expect(results).toHaveLength(2);
    });
  });
});
