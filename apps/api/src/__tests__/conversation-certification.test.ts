/**
 * Conversation OS Certification Test Suite
 *
 * Certifies the Conversation module lifecycle:
 * 1.  conversation_sessions and conversation_messages tables exist
 * 2.  Session retrieval returns the session
 * 3.  Session retrieval returns the session (duplicate guard)
 * 4.  Message ingestion persists a record
 * 5.  Message listing returns session messages
 * 6.  Session status update works
 * 7.  Session listing is tenant-scoped
 * 8.  Session context update persists context
 * 9.  Session close sets status to CLOSED
 * 10. Cross-tenant isolation — org B cannot see org A sessions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { ConversationSessionService, ConversationMessageService } from '@galaxy/conversation';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3301-4000-8000-330000000001';
const orgIdB = '00000000-3301-4000-8000-330000000002';
const participantId = '00000000-3301-4000-8000-330000000010';

let sharedSessionId: string;
let secondSessionId: string;

async function insertSession(
  orgId: string,
  externalId: string,
  channelType = 'whatsapp',
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO conversation_sessions
       (organization_id, whatsapp_phone, channel_type, external_id, participant_id, status, context, memory)
     VALUES ($1, $2, $3, $4, $5, 'OPEN', '{}', '{}')
     RETURNING id`,
    [orgId, 'cert-test', channelType, externalId, participantId],
  );
  return r.rows[0]?.id ?? '';
}

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Conversation Test Org A', 'conv-test-a', 'starter', 'active'),
            ($2, 'Conversation Test Org B', 'conv-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  sharedSessionId = await insertSession(orgId, 'ext-setup-001');
  secondSessionId = await insertSession(orgId, 'ext-setup-close');
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM conversation_messages WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM conversation_sessions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Conversation OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. conversation_sessions and conversation_messages tables exist', async () => {
    for (const table of ['conversation_sessions', 'conversation_messages']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Session retrieval returns the session ──────────────────────────────
  it('2. Session retrieval returns the session', async () => {
    const svc = new ConversationSessionService(pool);

    const session = await svc.getSession(orgId, sharedSessionId);
    expect(session.id).toBe(sharedSessionId);
    expect(session.organizationId).toBe(orgId);
  });

  // ── 3. Session listing is tenant-scoped ───────────────────────────────────
  it('3. Session listing is tenant-scoped', async () => {
    const svc = new ConversationSessionService(pool);

    const sessions = await svc.listSessions(orgId);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      expect(s.organizationId).toBe(orgId);
    }
  });

  // ── 4. Message ingestion ──────────────────────────────────────────────────
  it('4. Message ingestion persists a record', async () => {
    const svc = new ConversationMessageService(pool);

    const message = await svc.ingestMessage(
      orgId,
      sharedSessionId,
      'inbound',
      'Hello, I need help with my leave request',
      { from: participantId, timestamp: new Date().toISOString() },
    );

    expect(message.id).toBeTruthy();
    expect(message.organizationId).toBe(orgId);
    expect(message.sessionId).toBe(sharedSessionId);
    expect(message.direction).toBe('inbound');
    expect(message.content).toBe('Hello, I need help with my leave request');
  });

  // ── 5. Message listing ────────────────────────────────────────────────────
  it('5. Message listing returns session messages', async () => {
    const svc = new ConversationMessageService(pool);

    const messages = await svc.getMessages(orgId, sharedSessionId);
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(m.sessionId).toBe(sharedSessionId);
    }
  });

  // ── 6. Session status update ──────────────────────────────────────────────
  it('6. Session status update works', async () => {
    const svc = new ConversationSessionService(pool);

    const updated = await svc.updateSessionStatus(orgId, sharedSessionId, 'ACTIVE');
    expect(updated.status).toBe('ACTIVE');
  });

  // ── 7. Session context update persists context ────────────────────────────
  it('7. Session context update persists context', async () => {
    const svc = new ConversationSessionService(pool);

    const updated = await svc.updateSessionContext(orgId, sharedSessionId, {
      currentTopic: 'leave_request',
      leaveType: 'annual',
    });
    expect(updated.context).toMatchObject({ currentTopic: 'leave_request' });
  });

  // ── 8. Session close sets status to CLOSED ────────────────────────────────
  it('8. Session close sets status to CLOSED', async () => {
    const svc = new ConversationSessionService(pool);

    const closed = await svc.closeSession(orgId, secondSessionId);
    expect(closed.status).toBe('CLOSED');
  });

  // ── 9. Outbound message ingestion works ───────────────────────────────────
  it('9. Outbound message ingestion persists a record', async () => {
    const svc = new ConversationMessageService(pool);

    const message = await svc.ingestMessage(
      orgId,
      sharedSessionId,
      'outbound',
      'Your leave request has been submitted',
      { to: participantId, timestamp: new Date().toISOString() },
    );

    expect(message.id).toBeTruthy();
    expect(message.direction).toBe('outbound');
    expect(message.sessionId).toBe(sharedSessionId);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A sessions', async () => {
    const svc = new ConversationSessionService(pool);

    const sessionsB = await svc.listSessions(orgIdB);
    const leaked = sessionsB.some((s) => s.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
