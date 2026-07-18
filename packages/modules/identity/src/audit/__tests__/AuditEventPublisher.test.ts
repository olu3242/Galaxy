import { describe, it, expect, vi } from 'vitest';
import type { EventPublisher } from '@galaxy/events';
import type { AuditLogEntry } from '@galaxy/types';
import { AuditEventPublisher } from '../AuditEventPublisher.js';

vi.mock('@galaxy/utils', () => ({
  createEvent: vi.fn(
    (type: string, tenantId: string, correlationId: string, actor: unknown, payload: unknown) => ({
      id: 'event-uuid',
      version: '1.0',
      type,
      tenantId,
      correlationId,
      actor,
      payload,
    }),
  ),
}));

function makePublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;
}

const entry: AuditLogEntry = {
  id: 42,
  organizationId: '00000000-0000-0000-0000-000000000001',
  actorType: 'system',
  actorId: null,
  action: 'member.created',
  resourceType: 'member',
  resourceId: 'res-123',
  oldValue: null,
  newValue: null,
  ipAddress: null,
  correlationId: '00000000-0000-0000-0000-000000000099',
  causationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AuditEventPublisher.publishAuditRecorded', () => {
  it('calls publisher.publish once', async () => {
    const publisher = makePublisher();
    const aep = new AuditEventPublisher(publisher);
    await aep.publishAuditRecorded(entry, 'corr-111');
    expect(publisher.publish).toHaveBeenCalledOnce();
  });

  it('publishes event with type "audit.recorded"', async () => {
    const publisher = makePublisher();
    const aep = new AuditEventPublisher(publisher);
    await aep.publishAuditRecorded(entry, 'corr-111');
    const published = (publisher.publish as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      type: string;
    };
    expect(published.type).toBe('audit.recorded');
  });

  it('includes the organizationId as tenantId', async () => {
    const publisher = makePublisher();
    const aep = new AuditEventPublisher(publisher);
    await aep.publishAuditRecorded(entry, 'corr-111');
    const published = (publisher.publish as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      tenantId: string;
    };
    expect(published.tenantId).toBe(entry.organizationId);
  });

  it('passes correlationId to createEvent', async () => {
    const { createEvent } = await import('@galaxy/utils');
    const publisher = makePublisher();
    const aep = new AuditEventPublisher(publisher);
    await aep.publishAuditRecorded(entry, 'corr-999');
    expect(createEvent).toHaveBeenCalledWith(
      'audit.recorded',
      entry.organizationId,
      'corr-999',
      expect.objectContaining({ type: 'system' }),
      expect.objectContaining({ auditLogId: entry.id, action: entry.action }),
    );
  });
});
