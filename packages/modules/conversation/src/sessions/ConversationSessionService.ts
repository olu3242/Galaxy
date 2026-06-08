import type { Pool } from 'pg';
import type { ConversationSession, ChannelType, SessionStatus } from '../types.js';

interface SessionRow {
  id: string;
  organization_id: string;
  channel_type: string;
  external_id: string;
  participant_id: string;
  status: string;
  intent: string | null;
  language: string | null;
  sentiment: string | null;
  urgency_score: number | null;
  risk_score: number | null;
  context: Record<string, unknown>;
  memory: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

function rowToSession(row: SessionRow): ConversationSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    channelType: row.channel_type as ChannelType,
    externalId: row.external_id,
    participantId: row.participant_id,
    status: row.status as SessionStatus,
    context: row.context,
    memory: row.memory,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.intent !== null ? { intent: row.intent } : {}),
    ...(row.language !== null ? { language: row.language } : {}),
    ...(row.sentiment !== null ? { sentiment: row.sentiment } : {}),
    ...(row.urgency_score !== null ? { urgencyScore: row.urgency_score } : {}),
    ...(row.risk_score !== null ? { riskScore: row.risk_score } : {}),
    ...(row.closed_at !== null ? { closedAt: row.closed_at } : {}),
  };
}

export class ConversationSessionService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createSession(
    orgId: string,
    channelType: ChannelType,
    externalId: string,
    participantId: string,
  ): Promise<ConversationSession> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO conversation_sessions
         (organization_id, channel_type, external_id, participant_id, status, context, memory)
       VALUES ($1, $2, $3, $4, 'OPEN', '{}', '{}')
       ON CONFLICT (organization_id, channel_type, external_id)
       DO UPDATE SET updated_at = NOW(), status = 'OPEN'
       RETURNING *`,
      [orgId, channelType, externalId, participantId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create conversation session');
    return rowToSession(row);
  }

  async getSession(orgId: string, sessionId: string): Promise<ConversationSession> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SessionRow>(
      'SELECT * FROM conversation_sessions WHERE organization_id = $1 AND id = $2',
      [orgId, sessionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation session not found');
    return rowToSession(row);
  }

  async updateSessionStatus(
    orgId: string,
    sessionId: string,
    status: SessionStatus,
  ): Promise<ConversationSession> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SessionRow>(
      `UPDATE conversation_sessions
       SET status = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, sessionId, status],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation session not found');
    return rowToSession(row);
  }

  async updateSessionContext(
    orgId: string,
    sessionId: string,
    context: Record<string, unknown>,
  ): Promise<ConversationSession> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SessionRow>(
      `UPDATE conversation_sessions
       SET context = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, sessionId, JSON.stringify(context)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation session not found');
    return rowToSession(row);
  }

  async listSessions(
    orgId: string,
    status?: SessionStatus,
    limit?: number,
  ): Promise<ConversationSession[]> {
    await this.setTenantContext(orgId);
    const effectiveLimit = limit ?? 50;
    let result;
    if (status !== undefined) {
      result = await this.pool.query<SessionRow>(
        'SELECT * FROM conversation_sessions WHERE organization_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3',
        [orgId, status, effectiveLimit],
      );
    } else {
      result = await this.pool.query<SessionRow>(
        'SELECT * FROM conversation_sessions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2',
        [orgId, effectiveLimit],
      );
    }
    return result.rows.map(rowToSession);
  }

  async closeSession(orgId: string, sessionId: string): Promise<ConversationSession> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<SessionRow>(
      `UPDATE conversation_sessions
       SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, sessionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation session not found');
    return rowToSession(row);
  }
}
