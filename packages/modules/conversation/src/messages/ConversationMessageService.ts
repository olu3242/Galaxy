import type { Pool } from 'pg';
import type { ConversationMessage, MessageDirection, MessageStatus } from '../types.js';

interface MessageRow {
  id: string;
  organization_id: string;
  session_id: string;
  direction: string;
  status: string;
  content: string;
  raw_payload: Record<string, unknown>;
  intent: string | null;
  entities: Record<string, unknown>;
  sentiment: string | null;
  language: string | null;
  translated_content: string | null;
  created_at: Date;
}

function rowToMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sessionId: row.session_id,
    direction: row.direction as MessageDirection,
    status: row.status as MessageStatus,
    content: row.content,
    rawPayload: row.raw_payload,
    entities: row.entities,
    createdAt: row.created_at,
    ...(row.intent !== null ? { intent: row.intent } : {}),
    ...(row.sentiment !== null ? { sentiment: row.sentiment } : {}),
    ...(row.language !== null ? { language: row.language } : {}),
    ...(row.translated_content !== null ? { translatedContent: row.translated_content } : {}),
  };
}

export class ConversationMessageService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async ingestMessage(
    orgId: string,
    sessionId: string,
    direction: MessageDirection,
    content: string,
    rawPayload: Record<string, unknown>,
  ): Promise<ConversationMessage> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<MessageRow>(
      `INSERT INTO conversation_messages
         (organization_id, session_id, direction, status, content, raw_payload, entities)
       VALUES ($1, $2, $3, 'received', $4, $5, '{}')
       RETURNING *`,
      [orgId, sessionId, direction, content, JSON.stringify(rawPayload)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to ingest conversation message');
    return rowToMessage(row);
  }

  async getMessages(
    orgId: string,
    sessionId: string,
    limit?: number,
  ): Promise<ConversationMessage[]> {
    await this.setTenantContext(orgId);
    const effectiveLimit = limit ?? 100;
    const result = await this.pool.query<MessageRow>(
      `SELECT * FROM conversation_messages
       WHERE organization_id = $1 AND session_id = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [orgId, sessionId, effectiveLimit],
    );
    return result.rows.map(rowToMessage);
  }

  async updateMessageStatus(
    orgId: string,
    messageId: string,
    status: MessageStatus,
  ): Promise<ConversationMessage> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<MessageRow>(
      `UPDATE conversation_messages
       SET status = $3
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, messageId, status],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation message not found');
    return rowToMessage(row);
  }

  async analyzeMessage(
    orgId: string,
    messageId: string,
    intent?: string,
    entities?: Record<string, unknown>,
    sentiment?: string,
    language?: string,
  ): Promise<ConversationMessage> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<MessageRow>(
      `UPDATE conversation_messages
       SET
         intent = COALESCE($3, intent),
         entities = COALESCE($4, entities),
         sentiment = COALESCE($5, sentiment),
         language = COALESCE($6, language),
         status = 'processed'
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        messageId,
        intent ?? null,
        entities !== undefined ? JSON.stringify(entities) : null,
        sentiment ?? null,
        language ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Conversation message not found');
    return rowToMessage(row);
  }
}
