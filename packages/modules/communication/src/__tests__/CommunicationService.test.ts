/**
 * Communication OS — CommunicationService unit tests
 *
 * CommunicationService is a thin orchestrator that wires together the four
 * sub-services. Tests verify that each public property is an instance of the
 * correct class and that the constructor correctly wires the injected dependencies
 * through to each sub-service.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import type { AuditService } from '@galaxy/identity';
import { CommunicationService } from '../services/CommunicationService.js';
import { ChannelService } from '../services/ChannelService.js';
import { MessageService } from '../services/MessageService.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { AnnouncementService } from '../services/AnnouncementService.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

function makeEventPublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;
}

function makeAuditService(): AuditService {
  return { record: vi.fn().mockResolvedValue({}) } as unknown as AuditService;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('CommunicationService constructor', () => {
  it('exposes a ChannelService instance', () => {
    const pool = makePool([]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());
    expect(svc.channels).toBeInstanceOf(ChannelService);
  });

  it('exposes a MessageService instance', () => {
    const pool = makePool([]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());
    expect(svc.messages).toBeInstanceOf(MessageService);
  });

  it('exposes a BroadcastService instance', () => {
    const pool = makePool([]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());
    expect(svc.broadcasts).toBeInstanceOf(BroadcastService);
  });

  it('exposes an AnnouncementService instance', () => {
    const pool = makePool([]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());
    expect(svc.announcements).toBeInstanceOf(AnnouncementService);
  });

  it('wires the same pool to the channels sub-service', async () => {
    const ORG = '00000000-0000-0000-0000-000000000001';
    // set_config call + list query
    const pool = makePool([ok([]), ok([])]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());

    await svc.channels.list(ORG);

    expect(vi.mocked(pool.query)).toHaveBeenCalled();
  });

  it('wires the same pool to the messages sub-service', async () => {
    const ORG = '00000000-0000-0000-0000-000000000001';
    const CHANNEL_ID = '00000000-0000-0000-0000-000000000010';
    const pool = makePool([ok([]), ok([])]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());

    await svc.messages.listForChannel(ORG, CHANNEL_ID);

    expect(vi.mocked(pool.query)).toHaveBeenCalled();
  });

  it('wires the same pool to the broadcasts sub-service', async () => {
    const ORG = '00000000-0000-0000-0000-000000000001';
    const pool = makePool([ok([]), ok([])]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());

    await svc.broadcasts.list(ORG);

    expect(vi.mocked(pool.query)).toHaveBeenCalled();
  });

  it('wires the same pool to the announcements sub-service', async () => {
    const ORG = '00000000-0000-0000-0000-000000000001';
    const pool = makePool([ok([]), ok([])]);
    const svc = new CommunicationService(pool, makeEventPublisher(), makeAuditService());

    await svc.announcements.list(ORG);

    expect(vi.mocked(pool.query)).toHaveBeenCalled();
  });

  it('creates independent sub-service instances for different CommunicationService instances', () => {
    const pool = makePool([]);
    const svc1 = new CommunicationService(pool, makeEventPublisher(), makeAuditService());
    const svc2 = new CommunicationService(pool, makeEventPublisher(), makeAuditService());

    expect(svc1.channels).not.toBe(svc2.channels);
    expect(svc1.messages).not.toBe(svc2.messages);
    expect(svc1.broadcasts).not.toBe(svc2.broadcasts);
    expect(svc1.announcements).not.toBe(svc2.announcements);
  });
});
