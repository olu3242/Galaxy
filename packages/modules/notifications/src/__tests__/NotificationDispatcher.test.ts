/**
 * NotificationDispatcher unit tests
 *
 * Covers: dispatch — channel routing, preference gating, default channel fallback
 *
 * NotificationService and NotificationPreferenceService are fully mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotificationDispatcher } from '../services/NotificationDispatcher.js';
import type { NotificationService } from '../services/NotificationService.js';
import type { NotificationPreferenceService, NotificationPreference } from '../services/NotificationPreferenceService.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const MEMBER_ID = '00000000-0000-0000-0000-000000000020';
const ACTOR_ID = '00000000-0000-0000-0000-000000000030';
const CORR = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

function makeNotificationService(): NotificationService {
  return {
    create: vi.fn().mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000010',
      organizationId: ORG,
      recipientId: MEMBER_ID,
      templateId: null,
      channel: 'in_app',
      title: 'Test',
      body: 'Body',
      status: 'pending',
      readAt: null,
      data: {},
      correlationId: CORR,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    getById: vi.fn(),
    listForMember: vi.fn(),
    markAsRead: vi.fn(),
  } as unknown as NotificationService;
}

function makePrefService(
  prefsByChannel: Record<string, NotificationPreference | null> = {},
): NotificationPreferenceService {
  return {
    get: vi.fn(
      (_org: string, _member: string, channel: string, _type: string) =>
        Promise.resolve(prefsByChannel[channel] ?? null),
    ),
    upsert: vi.fn(),
    listForMember: vi.fn(),
  } as unknown as NotificationPreferenceService;
}

function makePref(channel: string, isEnabled: boolean): NotificationPreference {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    organizationId: ORG,
    memberId: MEMBER_ID,
    channel,
    notificationType: 'test.event',
    isEnabled,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const BASE_INPUT = {
  organizationId: ORG,
  recipientId: MEMBER_ID,
  notificationType: 'test.event',
  title: 'Hello',
  body: 'World',
  actorId: ACTOR_ID,
  correlationId: CORR,
};

// ─── dispatch ────────────────────────────────────────────────────────────────

describe('NotificationDispatcher.dispatch', () => {
  it('defaults to in_app channel when no channels specified', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService();
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch(BASE_INPUT);

    expect(notifSvc.create).toHaveBeenCalledOnce();
    expect(notifSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'in_app' }),
    );
  });

  it('sends to all specified channels when all preferences are enabled', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService({
      in_app: makePref('in_app', true),
      email: makePref('email', true),
    });
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch({ ...BASE_INPUT, channels: ['in_app', 'email'] });

    expect(notifSvc.create).toHaveBeenCalledTimes(2);
  });

  it('skips a channel when the preference explicitly disables it', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService({
      in_app: makePref('in_app', true),
      email: makePref('email', false),
    });
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch({ ...BASE_INPUT, channels: ['in_app', 'email'] });

    expect(notifSvc.create).toHaveBeenCalledOnce();
    expect(notifSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'in_app' }),
    );
  });

  it('sends when no preference record exists (defaults to enabled)', async () => {
    const notifSvc = makeNotificationService();
    // prefSvc returns null for all channels → default to enabled
    const prefSvc = makePrefService({});
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch({ ...BASE_INPUT, channels: ['whatsapp'] });

    expect(notifSvc.create).toHaveBeenCalledOnce();
    expect(notifSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp' }),
    );
  });

  it('skips all channels when all preferences are disabled', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService({
      in_app: makePref('in_app', false),
      sms: makePref('sms', false),
    });
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch({ ...BASE_INPUT, channels: ['in_app', 'sms'] });

    expect(notifSvc.create).not.toHaveBeenCalled();
  });

  it('passes data payload to NotificationService.create', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService({});
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    const data = { workflowId: 'wf-123' };
    await dispatcher.dispatch({ ...BASE_INPUT, data });

    expect(notifSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ data }),
    );
  });

  it('passes correlationId and actorId to NotificationService.create', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService({});
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch(BASE_INPUT);

    expect(notifSvc.create).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: CORR, actorId: ACTOR_ID }),
    );
  });

  it('checks preference for each channel with correct arguments', async () => {
    const notifSvc = makeNotificationService();
    const prefSvc = makePrefService({});
    const dispatcher = new NotificationDispatcher(notifSvc, prefSvc);

    await dispatcher.dispatch({ ...BASE_INPUT, channels: ['in_app', 'email'] });

    expect(prefSvc.get).toHaveBeenCalledWith(ORG, MEMBER_ID, 'in_app', 'test.event');
    expect(prefSvc.get).toHaveBeenCalledWith(ORG, MEMBER_ID, 'email', 'test.event');
  });
});
