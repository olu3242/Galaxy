/**
 * Support Service Certification Test Suite — Phase 74
 *
 * Certifies SupportService from @galaxy/platform-admin:
 * 1.  createTicket creates an open ticket
 * 2.  ticket has correct organizationId and submittedBy
 * 3.  listTickets returns tickets for the org
 * 4.  listTickets filters by status
 * 5.  updateStatus to 'resolved' sets resolvedAt
 * 6.  updateStatus to 'in_progress' does not set resolvedAt
 * 7.  addNote creates a note on the ticket
 * 8.  getNotes returns notes for the ticket
 * 9.  getNotes returns empty array for a ticket with no notes
 * 10. Cross-tenant: org B tickets are not in org A listTickets
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { SupportService } from '@galaxy/platform-admin';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-7401-4000-8000-740100000001';
const orgIdB = '00000000-7401-4000-8000-740100000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Support Phase 74 Org A', 'support-phase74-a', 'starter', 'active'),
            ($2, 'Support Phase 74 Org B', 'support-phase74-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(
      `DELETE FROM support_notes WHERE ticket_id IN (SELECT id FROM support_tickets WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(`DELETE FROM support_tickets WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Support Service Certification', () => {
  let ticketId: string;
  let emptyTicketId: string;

  // ── 1. createTicket creates open ticket ───────────────────────────────────
  it('1. createTicket creates an open ticket', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.createTicket({
      organizationId: orgId,
      submittedBy: 'cert74-user',
      subject: 'Phase 74 cert ticket',
      description: 'Test ticket for phase 74 certification',
      priority: 'medium',
    });
    expect(ticket).toBeTruthy();
    expect(ticket.id).toBeTruthy();
    expect(ticket.status).toBe('open');
    ticketId = ticket.id;
  });

  // ── 2. ticket has correct org and submittedBy ─────────────────────────────
  it('2. ticket has correct organizationId and submittedBy', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.createTicket({
      organizationId: orgId,
      submittedBy: 'cert74-user2',
      subject: 'Second cert ticket',
      description: 'Second test ticket',
    });
    expect(ticket.organizationId).toBe(orgId);
    expect(ticket.submittedBy).toBe('cert74-user2');
  });

  // ── 3. listTickets returns tickets for org ────────────────────────────────
  it('3. listTickets returns tickets for the org', async () => {
    const svc = new SupportService(pool);
    const tickets = await svc.listTickets({ organizationId: orgId });
    expect(Array.isArray(tickets)).toBe(true);
    expect(tickets.length).toBeGreaterThanOrEqual(2);
    expect(tickets.every((t) => t.organizationId === orgId)).toBe(true);
  });

  // ── 4. listTickets filters by status ─────────────────────────────────────
  it('4. listTickets filters by status=open', async () => {
    const svc = new SupportService(pool);
    const tickets = await svc.listTickets({ organizationId: orgId, status: 'open' });
    expect(tickets.every((t) => t.status === 'open')).toBe(true);
  });

  // ── 5. updateStatus to resolved sets resolvedAt ───────────────────────────
  it('5. updateStatus to resolved sets resolvedAt', async () => {
    const svc = new SupportService(pool);
    const updated = await svc.updateStatus(ticketId, 'resolved');
    expect(updated).toBeTruthy();
    expect(updated?.status).toBe('resolved');
    expect(updated?.resolvedAt).toBeTruthy();
  });

  // ── 6. updateStatus to in_progress doesn't set resolvedAt ────────────────
  it('6. updateStatus to in_progress does not set resolvedAt', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.createTicket({
      organizationId: orgId,
      submittedBy: 'cert74-user3',
      subject: 'In-progress cert ticket',
      description: 'Test in-progress status',
    });
    const updated = await svc.updateStatus(ticket.id, 'in_progress');
    expect(updated?.status).toBe('in_progress');
    expect(updated?.resolvedAt).toBeNull();
  });

  // ── 7. addNote creates a note ─────────────────────────────────────────────
  it('7. addNote creates a note on the ticket', async () => {
    const svc = new SupportService(pool);
    const note = await svc.addNote(ticketId, 'cert74-admin', 'This is a test note', false);
    expect(note).toBeTruthy();
    expect(note.id).toBeTruthy();
    expect(note.ticketId).toBe(ticketId);
    expect(note.content).toBe('This is a test note');
  });

  // ── 8. getNotes returns notes for ticket ──────────────────────────────────
  it('8. getNotes returns notes for the ticket', async () => {
    const svc = new SupportService(pool);
    const notes = await svc.getNotes(ticketId);
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.ticketId === ticketId)).toBe(true);
  });

  // ── 9. getNotes returns empty for ticket with no notes ────────────────────
  it('9. getNotes returns empty array for a ticket with no notes', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.createTicket({
      organizationId: orgId,
      submittedBy: 'cert74-user4',
      subject: 'Empty notes ticket',
      description: 'No notes added',
    });
    emptyTicketId = ticket.id;
    const notes = await svc.getNotes(emptyTicketId);
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBe(0);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. org B tickets are not returned in org A listTickets', async () => {
    const svc = new SupportService(pool);
    await svc.createTicket({
      organizationId: orgIdB,
      submittedBy: 'cert74-b-user',
      subject: 'Org B ticket',
      description: 'Should not appear in org A list',
    });
    const ticketsA = await svc.listTickets({ organizationId: orgId });
    const ticketsB = await svc.listTickets({ organizationId: orgIdB });
    expect(ticketsA.every((t) => t.organizationId === orgId)).toBe(true);
    expect(ticketsB.every((t) => t.organizationId === orgIdB)).toBe(true);
    expect(ticketsA.some((t) => t.organizationId === orgIdB)).toBe(false);
  });
});
