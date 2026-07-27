/**
 * Platform Audit & Support OS Certification Test Suite
 *
 * Certifies the audit query and support ticket lifecycle:
 * 1.  createTicket returns a SupportTicket with status 'open'
 * 2.  listTickets returns tickets for the org
 * 3.  updateTicketStatus transitions to 'in_progress'
 * 4.  updateTicketStatus transitions to 'resolved' and sets resolved_at
 * 5.  addAdminNote persists a note
 * 6.  listTickets filters by status
 * 7.  queryLogs returns audit log entries for the org
 * 8.  queryLogs filters by action
 * 9.  queryLogs respects limit
 * 10. Cross-tenant isolation — org B tickets are not visible to org A query
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { SupportService, AuditService } from '@galaxy/platform';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6401-4000-8000-640000000001';
const orgIdB = '00000000-6401-4000-8000-640000000002';

let ticketId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Support Phase 64 Org A', 'support-phase64-a', 'starter', 'active'),
            ($2, 'Support Phase 64 Org B', 'support-phase64-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
  await pool
    .query(
      `INSERT INTO audit_logs (organization_id, actor_type, action, resource_type, resource_id, correlation_id)
     VALUES ($1, 'system', 'org.created', 'organization', $1, gen_random_uuid())`,
      [orgId],
    )
    .catch(() => null);
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM admin_notes WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM support_tickets WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Platform Audit & Support OS Certification', () => {
  // ── 1. createTicket returns SupportTicket ─────────────────────────────────
  it('1. createTicket returns a SupportTicket with status open', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.createTicket({
      organizationId: orgId,
      subject: 'Phase 64 certification ticket',
      description: 'Certification test for support service',
      priority: 'high',
    });
    expect(ticket).toBeTruthy();
    expect(ticket.id).toBeTruthy();
    expect(ticket.organizationId).toBe(orgId);
    expect(ticket.status).toBe('open');
    ticketId = ticket.id;
  });

  // ── 2. listTickets returns tickets ────────────────────────────────────────
  it('2. listTickets returns tickets for the org', async () => {
    const svc = new SupportService(pool);
    const tickets = await svc.listTickets(orgId);
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((t) => t.organizationId === orgId)).toBe(true);
  });

  // ── 3. updateTicketStatus to in_progress ─────────────────────────────────
  it('3. updateTicketStatus transitions to in_progress', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.updateTicketStatus(ticketId, 'in_progress');
    expect(ticket).not.toBeNull();
    expect(ticket?.status).toBe('in_progress');
  });

  // ── 4. updateTicketStatus to resolved sets resolved_at ───────────────────
  it('4. updateTicketStatus transitions to resolved and sets resolved_at', async () => {
    const svc = new SupportService(pool);
    const ticket = await svc.updateTicketStatus(ticketId, 'resolved');
    expect(ticket).not.toBeNull();
    expect(ticket?.status).toBe('resolved');
    expect(ticket?.resolvedAt).toBeTruthy();
  });

  // ── 5. addAdminNote persists a note ───────────────────────────────────────
  it('5. addAdminNote persists a note', async () => {
    const svc = new SupportService(pool);
    const note = await svc.addAdminNote({
      organizationId: orgId,
      authorId: 'admin-cert-user',
      content: 'Phase 64 certification admin note',
    });
    expect(note).toBeTruthy();
    expect(note.organizationId).toBe(orgId);
    expect(note.content).toBe('Phase 64 certification admin note');
  });

  // ── 6. listTickets filters by status ─────────────────────────────────────
  it('6. listTickets filters by status', async () => {
    const svc = new SupportService(pool);
    const resolved = await svc.listTickets(orgId, { status: 'resolved' });
    expect(resolved.every((t) => t.status === 'resolved')).toBe(true);
  });

  // ── 7. queryLogs returns audit log entries ────────────────────────────────
  it('7. queryLogs returns audit log entries for the org', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId });
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.organizationId === orgId)).toBe(true);
  });

  // ── 8. queryLogs filters by action ───────────────────────────────────────
  it('8. queryLogs filters by action', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, action: 'org.created' });
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.every((l) => l.action === 'org.created')).toBe(true);
  });

  // ── 9. queryLogs respects limit ───────────────────────────────────────────
  it('9. queryLogs respects limit', async () => {
    const svc = new AuditService(pool);
    const logs = await svc.queryLogs({ organizationId: orgId, limit: 1 });
    expect(logs.length).toBeLessThanOrEqual(1);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B tickets are not visible to org A query', async () => {
    const svc = new SupportService(pool);
    await svc.createTicket({
      organizationId: orgIdB,
      subject: 'Org B ticket',
      description: 'Should not appear in org A query',
    });
    const ticketsA = await svc.listTickets(orgId);
    const ticketsB = await svc.listTickets(orgIdB);
    expect(ticketsA.every((t) => t.organizationId === orgId)).toBe(true);
    expect(ticketsB.every((t) => t.organizationId === orgIdB)).toBe(true);
    expect(ticketsA.some((t) => t.organizationId === orgIdB)).toBe(false);
  });
});
