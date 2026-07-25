/**
 * Communication OS Certification Test Suite
 *
 * Certifies the Communication module lifecycle:
 * 1.  channels and messages tables exist
 * 2.  Channel creation persists a record
 * 3.  Channel member addition and listing
 * 4.  Message sending persists a record
 * 5.  Message listing is scoped to channel
 * 6.  Broadcast creation persists a draft
 * 7.  Broadcast send transitions status
 * 8.  Announcement creation persists a record
 * 9.  Announcement publish transitions status
 * 10. Cross-tenant isolation — org B cannot see org A channels
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  ChannelService,
  MessageService,
  BroadcastService,
  AnnouncementService,
} from '@galaxy/communication';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2601-4000-8000-260000000001';
const orgIdB = '00000000-2601-4000-8000-260000000002';
const memberId = '00000000-2601-4000-8000-260000000010';

const noopPublisher = {
  publish: () => Promise.resolve({ success: true }),
} as unknown as EventPublisher;

const noopAudit = {
  log: () => Promise.resolve(),
  logEvent: () => Promise.resolve(),
} as unknown as AuditService;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Comm Test Org A', 'comm-test-a', 'starter', 'active'),
            ($2, 'Comm Test Org B', 'comm-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM announcements WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM broadcasts WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM messages WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM channel_members WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM channels WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Communication OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. channels and messages tables exist', async () => {
    for (const table of ['channels', 'messages']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Channel creation ───────────────────────────────────────────────────
  it('2. Channel creation persists a record', async () => {
    const svc = new ChannelService(pool, noopPublisher, noopAudit);

    const channel = await svc.create({
      organizationId: orgId,
      name: 'general',
      description: 'General discussion',
      channelType: 'public',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    expect(channel.id).toBeTruthy();
    expect(channel.organizationId).toBe(orgId);
    expect(channel.name).toBe('general');
  });

  // ── 3. Channel member management ──────────────────────────────────────────
  it('3. Channel member addition and listing works', async () => {
    const svc = new ChannelService(pool, noopPublisher, noopAudit);

    const channel = await svc.create({
      organizationId: orgId,
      name: `members-test-${crypto.randomUUID().slice(0, 8)}`,
      channelType: 'private',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    await svc.addMember({
      organizationId: orgId,
      channelId: channel.id,
      memberId,
      role: 'member',
      actorId: memberId,
      correlationId: crypto.randomUUID(),
    });

    const members = await svc.listMembers(orgId, channel.id);
    expect(Array.isArray(members)).toBe(true);
    expect(members.some((m) => m.memberId === memberId)).toBe(true);
  });

  // ── 4. Message sending ────────────────────────────────────────────────────
  it('4. Message sending persists a record', async () => {
    const chanSvc = new ChannelService(pool, noopPublisher, noopAudit);
    const msgSvc = new MessageService(pool, noopPublisher, noopAudit);

    const channel = await chanSvc.create({
      organizationId: orgId,
      name: `msg-chan-${crypto.randomUUID().slice(0, 8)}`,
      channelType: 'public',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    const message = await msgSvc.send({
      organizationId: orgId,
      channelId: channel.id,
      senderId: memberId,
      content: 'Hello from certification test',
      contentType: 'text',
      correlationId: crypto.randomUUID(),
    });

    expect(message.id).toBeTruthy();
    expect(message.organizationId).toBe(orgId);
    expect(message.channelId).toBe(channel.id);
    expect(message.senderId).toBe(memberId);
  });

  // ── 5. Message listing ────────────────────────────────────────────────────
  it('5. Message listing is scoped to channel', async () => {
    const chanSvc = new ChannelService(pool, noopPublisher, noopAudit);
    const msgSvc = new MessageService(pool, noopPublisher, noopAudit);

    const channel = await chanSvc.create({
      organizationId: orgId,
      name: `list-chan-${crypto.randomUUID().slice(0, 8)}`,
      channelType: 'public',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    await msgSvc.send({
      organizationId: orgId,
      channelId: channel.id,
      senderId: memberId,
      content: 'Message one',
      correlationId: crypto.randomUUID(),
    });

    const messages = await msgSvc.listForChannel(orgId, channel.id);
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) {
      expect(m.channelId).toBe(channel.id);
    }
  });

  // ── 6. Broadcast creation ─────────────────────────────────────────────────
  it('6. Broadcast creation persists a draft', async () => {
    const svc = new BroadcastService(pool, noopPublisher, noopAudit);

    const broadcast = await svc.create({
      organizationId: orgId,
      title: 'Quarterly Update',
      content: 'Q3 results are in.',
      targetType: 'all',
      targetIds: [],
      sentBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    expect(broadcast.id).toBeTruthy();
    expect(broadcast.organizationId).toBe(orgId);
    expect(broadcast.title).toBe('Quarterly Update');
  });

  // ── 7. Broadcast send ─────────────────────────────────────────────────────
  it('7. Broadcast send transitions status', async () => {
    const svc = new BroadcastService(pool, noopPublisher, noopAudit);

    const broadcast = await svc.create({
      organizationId: orgId,
      title: `Send Test ${crypto.randomUUID().slice(0, 8)}`,
      content: 'Broadcast to send.',
      targetType: 'all',
      targetIds: [],
      sentBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    const sent = await svc.send(orgId, broadcast.id);
    expect(['sent', 'sending', 'scheduled']).toContain(sent.status);
  });

  // ── 8. Announcement creation ──────────────────────────────────────────────
  it('8. Announcement creation persists a record', async () => {
    const svc = new AnnouncementService(pool, noopPublisher, noopAudit);

    const announcement = await svc.create({
      organizationId: orgId,
      title: 'New Policy Update',
      body: 'Please review the updated remote work policy.',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    expect(announcement.id).toBeTruthy();
    expect(announcement.organizationId).toBe(orgId);
    expect(announcement.title).toBe('New Policy Update');
  });

  // ── 9. Announcement publish ───────────────────────────────────────────────
  it('9. Announcement publish transitions status', async () => {
    const svc = new AnnouncementService(pool, noopPublisher, noopAudit);

    const announcement = await svc.create({
      organizationId: orgId,
      title: `Publish Test ${crypto.randomUUID().slice(0, 8)}`,
      body: 'This will be published.',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    const published = await svc.publish(orgId, announcement.id, memberId);
    expect(published.status).toBe('published');
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A channels', async () => {
    const svc = new ChannelService(pool, noopPublisher, noopAudit);

    await svc.create({
      organizationId: orgId,
      name: `isolation-${crypto.randomUUID().slice(0, 8)}`,
      channelType: 'public',
      createdBy: memberId,
      correlationId: crypto.randomUUID(),
    });

    const channelsB = await svc.list(orgIdB, 20, 0);
    const leaked = channelsB.some((c) => c.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
