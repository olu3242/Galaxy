import type { Pool } from 'pg';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SupportTicket {
  id: string;
  organizationId: string;
  submittedBy: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportNote {
  id: string;
  ticketId: string;
  authorId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface CreateTicketInput {
  organizationId: string;
  submittedBy: string;
  subject: string;
  description: string;
  priority?: TicketPriority;
}

interface TicketRow {
  id: string;
  organization_id: string;
  submitted_by: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NoteRow {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export class SupportService {
  constructor(private readonly pool: Pool) {}

  async createTicket(input: CreateTicketInput): Promise<SupportTicket> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', input.organizationId]);
    const result = await this.pool.query<TicketRow>(
      `INSERT INTO support_tickets
         (organization_id, submitted_by, subject, description, status, priority)
       VALUES ($1, $2, $3, $4, 'open', $5)
       RETURNING *`,
      [input.organizationId, input.submittedBy, input.subject, input.description, input.priority ?? 'medium'],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Ticket creation failed');
    return this.rowToTicket(row);
  }

  async listTickets(opts?: {
    organizationId?: string;
    status?: TicketStatus;
    limit?: number;
    offset?: number;
  }): Promise<SupportTicket[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.organizationId !== undefined) {
      conditions.push(`organization_id = $${String(idx)}`);
      params.push(opts.organizationId);
      idx++;
    }
    if (opts?.status !== undefined) {
      conditions.push(`status = $${String(idx)}`);
      params.push(opts.status);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts?.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
      idx++;
    }
    const offsetClause = opts?.offset !== undefined ? ` OFFSET $${String(idx)}` : '';
    if (opts?.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<TicketRow>(
      `SELECT * FROM support_tickets ${whereClause} ORDER BY created_at DESC${limitClause}${offsetClause}`,
      params,
    );
    return result.rows.map((row) => this.rowToTicket(row));
  }

  async updateStatus(ticketId: string, status: TicketStatus): Promise<SupportTicket | null> {
    const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
    const result = await this.pool.query<TicketRow>(
      `UPDATE support_tickets
       SET status = $1, resolved_at = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, resolvedAt, ticketId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToTicket(row);
  }

  async addNote(
    ticketId: string,
    authorId: string,
    content: string,
    isInternal = false,
  ): Promise<SupportNote> {
    const result = await this.pool.query<NoteRow>(
      `INSERT INTO support_notes (ticket_id, author_id, content, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketId, authorId, content, isInternal],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Note creation failed');
    return {
      id: row.id,
      ticketId: row.ticket_id,
      authorId: row.author_id,
      content: row.content,
      isInternal: row.is_internal,
      createdAt: row.created_at,
    };
  }

  async getNotes(ticketId: string): Promise<SupportNote[]> {
    const result = await this.pool.query<NoteRow>(
      'SELECT * FROM support_notes WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      authorId: row.author_id,
      content: row.content,
      isInternal: row.is_internal,
      createdAt: row.created_at,
    }));
  }

  private rowToTicket(row: TicketRow): SupportTicket {
    return {
      id: row.id,
      organizationId: row.organization_id,
      submittedBy: row.submitted_by,
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
}
