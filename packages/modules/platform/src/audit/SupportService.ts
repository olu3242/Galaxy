import type { Pool } from 'pg';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SupportTicket {
  id: string;
  organizationId: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNote {
  id: string;
  organizationId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

interface SupportTicketRow {
  id: string;
  organization_id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminNoteRow {
  id: string;
  organization_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export class SupportService {
  constructor(private readonly pool: Pool) {}

  async createTicket(input: {
    organizationId: string;
    subject: string;
    description: string;
    priority?: TicketPriority;
  }): Promise<SupportTicket> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<SupportTicketRow>(
      `INSERT INTO support_tickets (organization_id, subject, description, priority)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.organizationId, input.subject, input.description, input.priority ?? 'medium'],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create support ticket');
    return this.mapTicket(row);
  }

  async listTickets(
    organizationId: string,
    opts?: { status?: TicketStatus; limit?: number },
  ): Promise<SupportTicket[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const params: unknown[] = [organizationId];
    let idx = 2;
    const extraWhere = opts?.status !== undefined ? ` AND status = $${String(idx++)}` : '';
    if (opts?.status !== undefined) params.push(opts.status);
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<SupportTicketRow>(
      `SELECT * FROM support_tickets WHERE organization_id = $1${extraWhere} ORDER BY created_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapTicket(r));
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<SupportTicket | null> {
    const resolvedAt = status === 'resolved' ? 'NOW()' : 'resolved_at';
    const result = await this.pool.query<SupportTicketRow>(
      `UPDATE support_tickets SET status = $1, resolved_at = ${resolvedAt}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, ticketId],
    );
    const row = result.rows[0];
    return row ? this.mapTicket(row) : null;
  }

  async addAdminNote(input: {
    organizationId: string;
    authorId: string;
    content: string;
  }): Promise<AdminNote> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<AdminNoteRow>(
      `INSERT INTO admin_notes (organization_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.organizationId, input.authorId, input.content],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to add admin note');
    return this.mapNote(row);
  }

  private mapTicket(row: SupportTicketRow): SupportTicket {
    return {
      id: row.id,
      organizationId: row.organization_id,
      subject: row.subject,
      description: row.description,
      status: row.status as TicketStatus,
      priority: row.priority as TicketPriority,
      assignedTo: row.assigned_to,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapNote(row: AdminNoteRow): AdminNote {
    return {
      id: row.id,
      organizationId: row.organization_id,
      authorId: row.author_id,
      content: row.content,
      createdAt: row.created_at,
    };
  }
}
