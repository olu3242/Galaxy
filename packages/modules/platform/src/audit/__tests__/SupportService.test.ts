import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SupportService } from '../SupportService.js';

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
  id: 'tkt-1',
  organization_id: 'org-1',
  subject: 'Help!',
  description: 'Something broke',
  status: 'open',
  priority: 'high',
  assigned_to: null,
  resolved_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const noteRow = {
  id: 'note-1',
  organization_id: 'org-1',
  author_id: 'admin-1',
  content: 'Looking into it',
  created_at: '2024-01-01T00:00:00Z',
};

describe('SupportService', () => {
  describe('createTicket', () => {
    it('sets tenant context then inserts ticket', async () => {
      const pool = makePool([ok([]), ok([ticketRow])]);
      const svc = new SupportService(pool);
      const result = await svc.createTicket({
        organizationId: 'org-1',
        subject: 'Help!',
        description: 'Something broke',
        priority: 'high',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('tkt-1');
      expect(result.priority).toBe('high');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SupportService(pool);
      await expect(
        svc.createTicket({ organizationId: 'org-1', subject: 'x', description: 'y' }),
      ).rejects.toThrow('Failed to create support ticket');
    });
  });

  describe('listTickets', () => {
    it('sets tenant context and returns tickets', async () => {
      const pool = makePool([ok([]), ok([ticketRow])]);
      const svc = new SupportService(pool);
      const result = await svc.listTickets('org-1');
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result[0]?.subject).toBe('Help!');
    });

    it('returns empty array when no tickets', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SupportService(pool);
      const result = await svc.listTickets('org-1');
      expect(result).toHaveLength(0);
    });

    it('passes status filter', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SupportService(pool);
      await svc.listTickets('org-1', { status: 'open', limit: 5 });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const params = (calls[1]?.[1] ?? []) as unknown[];
      expect(params).toContain('open');
      expect(params).toContain(5);
    });
  });

  describe('updateTicketStatus', () => {
    it('returns updated ticket', async () => {
      const updated = { ...ticketRow, status: 'resolved', resolved_at: '2024-01-02T00:00:00Z' };
      const pool = makePool([ok([updated])]);
      const svc = new SupportService(pool);
      const result = await svc.updateTicketStatus('tkt-1', 'resolved');
      expect(result?.status).toBe('resolved');
    });

    it('returns null when ticket not found', async () => {
      const pool = makePool([ok([])]);
      const svc = new SupportService(pool);
      const result = await svc.updateTicketStatus('missing', 'closed');
      expect(result).toBeNull();
    });
  });

  describe('addAdminNote', () => {
    it('sets tenant context and returns note', async () => {
      const pool = makePool([ok([]), ok([noteRow])]);
      const svc = new SupportService(pool);
      const result = await svc.addAdminNote({
        organizationId: 'org-1',
        authorId: 'admin-1',
        content: 'Looking into it',
      });
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toContain('set_config');
      expect(result.id).toBe('note-1');
      expect(result.content).toBe('Looking into it');
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SupportService(pool);
      await expect(
        svc.addAdminNote({ organizationId: 'org-1', authorId: 'a', content: 'x' }),
      ).rejects.toThrow('Failed to add admin note');
    });
  });
});
