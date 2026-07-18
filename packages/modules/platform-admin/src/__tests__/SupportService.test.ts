import { describe, it, expect, vi } from 'vitest';
import { SupportService } from '../audit/SupportService.js';
import type { Pool, QueryResult } from 'pg';

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

const ticketRow = {
  id: 'ticket-1',
  organization_id: 'org-1',
  submitted_by: 'user-1',
  subject: 'Help needed',
  description: 'Detailed description',
  status: 'open',
  priority: 'medium',
  assigned_to: null,
  resolved_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const noteRow = {
  id: 'note-1',
  ticket_id: 'ticket-1',
  author_id: 'admin-1',
  content: 'Looking into this',
  is_internal: true,
  created_at: '2024-01-01T00:00:00Z',
};

describe('SupportService', () => {
  describe('createTicket', () => {
    it('sets tenant context then inserts ticket', async () => {
      const pool = makePool([ok([]), ok([ticketRow])]);
      const svc = new SupportService(pool);
      const result = await svc.createTicket({
        organizationId: 'org-1',
        submittedBy: 'user-1',
        subject: 'Help needed',
        description: 'Detailed description',
      });
      expect(result.id).toBe('ticket-1');
      expect(result.status).toBe('open');
      expect(result.priority).toBe('medium');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![0]).toContain('set_config');
      expect(calls[0]![1]).toContain('org-1');
    });

    it('uses provided priority', async () => {
      const pool = makePool([ok([]), ok([{ ...ticketRow, priority: 'high' }])]);
      const svc = new SupportService(pool);
      const result = await svc.createTicket({
        organizationId: 'org-1',
        submittedBy: 'user-1',
        subject: 'Urgent',
        description: 'Fix now',
        priority: 'high',
      });
      expect(result.priority).toBe('high');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[1]![1]).toContain('high');
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SupportService(pool);
      await expect(
        svc.createTicket({
          organizationId: 'org-1',
          submittedBy: 'user-1',
          subject: 'sub',
          description: 'desc',
        }),
      ).rejects.toThrow('Ticket creation failed');
    });
  });

  describe('listTickets', () => {
    it('returns all tickets without filters', async () => {
      const pool = makePool([ok([ticketRow])]);
      const svc = new SupportService(pool);
      const results = await svc.listTickets();
      expect(results).toHaveLength(1);
      expect(results[0]!.subject).toBe('Help needed');
    });

    it('returns empty array when no tickets', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      const results = await svc.listTickets();
      expect(results).toHaveLength(0);
    });

    it('passes organizationId and status filters', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      await svc.listTickets({ organizationId: 'org-1', status: 'open' });
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      const params = calls[0]![1] as unknown[];
      expect(params).toContain('org-1');
      expect(params).toContain('open');
    });
  });

  describe('updateStatus', () => {
    it('returns updated ticket', async () => {
      const pool = makePool([
        ok([{ ...ticketRow, status: 'resolved', resolved_at: '2024-01-02' }]),
      ]);
      const svc = new SupportService(pool);
      const result = await svc.updateStatus('ticket-1', 'resolved');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
    });

    it('returns null when ticket not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      const result = await svc.updateStatus('nonexistent', 'resolved');
      expect(result).toBeNull();
    });

    it('passes ticketId and status as parameters', async () => {
      const pool = makePool([ok([ticketRow])]);
      const svc = new SupportService(pool);
      await svc.updateStatus('ticket-1', 'in_progress');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('ticket-1');
      expect(calls[0]![1]).toContain('in_progress');
    });
  });

  describe('addNote', () => {
    it('inserts and returns note', async () => {
      const pool = makePool([ok([noteRow])]);
      const svc = new SupportService(pool);
      const result = await svc.addNote('ticket-1', 'admin-1', 'Looking into this', true);
      expect(result.id).toBe('note-1');
      expect(result.isInternal).toBe(true);
      expect(result.content).toBe('Looking into this');
    });

    it('defaults isInternal to false', async () => {
      const pool = makePool([ok([{ ...noteRow, is_internal: false }])]);
      const svc = new SupportService(pool);
      await svc.addNote('ticket-1', 'admin-1', 'Public note');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain(false);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      await expect(svc.addNote('ticket-1', 'admin-1', 'note')).rejects.toThrow(
        'Note creation failed',
      );
    });
  });

  describe('getNotes', () => {
    it('returns notes for ticket', async () => {
      const pool = makePool([ok([noteRow])]);
      const svc = new SupportService(pool);
      const results = await svc.getNotes('ticket-1');
      expect(results).toHaveLength(1);
      expect(results[0]!.ticketId).toBe('ticket-1');
    });

    it('returns empty array when no notes', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      const results = await svc.getNotes('ticket-1');
      expect(results).toHaveLength(0);
    });

    it('passes ticketId as parameter', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      await svc.getNotes('ticket-99');
      const calls = vi.mocked(pool.query).mock.calls as unknown as [string, unknown[]][];
      expect(calls[0]![1]).toContain('ticket-99');
    });
  });
});
