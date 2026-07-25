/**
 * Notifications OS Certification Test Suite
 *
 * Certifies the Notifications module lifecycle:
 * 1.  notifications and notification_templates tables exist
 * 2.  Notification template creation persists a record
 * 3.  Template retrieval returns the correct record
 * 4.  Template listing is tenant-scoped
 * 5.  Notification creation persists with correct fields
 * 6.  Notification listing is scoped to the recipient
 * 7.  Marking a notification as read updates its status
 * 8.  Notification preference upsert persists settings
 * 9.  Preference listing is scoped to the member
 * 10. Cross-tenant isolation — org B cannot see org A notifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  NotificationService,
  NotificationTemplateService,
  NotificationPreferenceService,
} from '@galaxy/notifications';
import type { EventPublisher } from '@galaxy/events';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2301-4000-8000-230000000001';
const orgIdB = '00000000-2301-4000-8000-230000000002';
const memberId = '00000000-2301-4000-8000-230000000010';
const actorId = '00000000-2301-4000-8000-230000000011';

// Minimal stub — tests don't exercise event delivery
const noopPublisher = {
  publish: () => Promise.resolve({ success: true }),
} as unknown as EventPublisher;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Notif Test Org A', 'notif-test-a', 'starter', 'active'),
            ($2, 'Notif Test Org B', 'notif-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM notification_preferences WHERE organization_id IN ($1, $2)`, [
      orgId,
      orgIdB,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM notifications WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM notification_templates WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Notifications OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. notifications and notification_templates tables exist', async () => {
    for (const table of ['notifications', 'notification_templates']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Template creation ──────────────────────────────────────────────────
  it('2. Notification template creation persists a record', async () => {
    const svc = new NotificationTemplateService(pool);

    const tmpl = await svc.create({
      organizationId: orgId,
      name: 'Approval Request',
      description: 'Sent when an approval is requested',
      channel: 'in_app',
      body: 'You have a pending approval: {{workflowName}}',
      variables: ['workflowName'],
      createdBy: actorId,
    });

    expect(tmpl.id).toBeTruthy();
    expect(tmpl.organizationId).toBe(orgId);
    expect(tmpl.name).toBe('Approval Request');
    expect(tmpl.channel).toBe('in_app');
  });

  // ── 3. Template retrieval ─────────────────────────────────────────────────
  it('3. Template retrieval returns the correct record', async () => {
    const svc = new NotificationTemplateService(pool);

    const created = await svc.create({
      organizationId: orgId,
      name: 'Retrieval Test Template',
      channel: 'email',
      subject: 'Test Subject',
      body: 'Hello {{name}}, this is a test.',
      variables: ['name'],
      createdBy: actorId,
    });

    const fetched = await svc.getById(orgId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.organizationId).toBe(orgId);
  });

  // ── 4. Template listing ───────────────────────────────────────────────────
  it('4. Template listing is tenant-scoped', async () => {
    const svc = new NotificationTemplateService(pool);

    const templates = await svc.list(orgId);
    expect(Array.isArray(templates)).toBe(true);
    for (const t of templates) {
      expect(t.organizationId).toBe(orgId);
    }
  });

  // ── 5. Notification creation ──────────────────────────────────────────────
  it('5. Notification creation persists with correct fields', async () => {
    const svc = new NotificationService(pool, noopPublisher);

    const notification = await svc.create({
      organizationId: orgId,
      recipientId: memberId,
      channel: 'in_app',
      title: 'New approval required',
      body: 'Please review and approve the Leave Request workflow.',
      actorId,
      correlationId: crypto.randomUUID(),
    });

    expect(notification.id).toBeTruthy();
    expect(notification.organizationId).toBe(orgId);
    expect(notification.recipientId).toBe(memberId);
    expect(notification.channel).toBe('in_app');
  });

  // ── 6. Notification listing by member ─────────────────────────────────────
  it('6. Notification listing is scoped to the recipient', async () => {
    const svc = new NotificationService(pool, noopPublisher);

    await svc.create({
      organizationId: orgId,
      recipientId: memberId,
      channel: 'in_app',
      title: 'Listing test notification',
      body: 'This notification is for listing test.',
      actorId,
      correlationId: crypto.randomUUID(),
    });

    const notifications = await svc.listForMember(orgId, memberId);
    expect(Array.isArray(notifications)).toBe(true);
    expect(notifications.length).toBeGreaterThan(0);
    for (const n of notifications) {
      expect(n.recipientId).toBe(memberId);
    }
  });

  // ── 7. Mark as read ───────────────────────────────────────────────────────
  it('7. Marking a notification as read updates its status', async () => {
    const svc = new NotificationService(pool, noopPublisher);

    const notification = await svc.create({
      organizationId: orgId,
      recipientId: memberId,
      channel: 'in_app',
      title: 'Read test notification',
      body: 'This will be marked as read.',
      actorId,
      correlationId: crypto.randomUUID(),
    });

    const read = await svc.markAsRead(orgId, notification.id, memberId);
    expect(read.status).toBe('read');
  });

  // ── 8. Notification preferences ───────────────────────────────────────────
  it('8. Notification preference upsert persists settings', async () => {
    const svc = new NotificationPreferenceService(pool);

    const pref = await svc.upsert({
      organizationId: orgId,
      memberId,
      channel: 'email',
      notificationType: 'approval_request',
      isEnabled: false,
    });

    expect(pref.id).toBeTruthy();
    expect(pref.isEnabled).toBe(false);
  });

  // ── 9. Preference listing ─────────────────────────────────────────────────
  it('9. Preference listing is scoped to the member', async () => {
    const svc = new NotificationPreferenceService(pool);

    const prefs = await svc.listForMember(orgId, memberId);
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs.some((p: { channel: string }) => p.channel === 'email')).toBe(true);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A notifications', async () => {
    const svc = new NotificationService(pool, noopPublisher);

    await svc.create({
      organizationId: orgId,
      recipientId: memberId,
      channel: 'in_app',
      title: 'Isolation test notification',
      body: 'Secret content from org A.',
      actorId,
      correlationId: crypto.randomUUID(),
    });

    const notifB = await svc.listForMember(orgIdB, memberId);
    const leaked = notifB.some((n: { organizationId: string }) => n.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
