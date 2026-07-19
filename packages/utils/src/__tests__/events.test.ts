/**
 * @galaxy/utils — createEvent · newCorrelationId unit tests
 */
import { describe, it, expect } from 'vitest';
import { createEvent, newCorrelationId } from '../events.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const actor = { type: 'member' as const, id: 'user-1' };
const tenantId = '00000000-0000-0000-0000-000000000001';
const correlationId = '00000000-0000-0000-0000-000000000002';

// ─── createEvent ─────────────────────────────────────────────────────────────

describe('createEvent', () => {
  it('returns a GalaxyEvent with the correct required fields', () => {
    const event = createEvent('workflow.submitted', tenantId, correlationId, actor, { foo: 'bar' });

    expect(event.type).toBe('workflow.submitted');
    expect(event.tenantId).toBe(tenantId);
    expect(event.correlationId).toBe(correlationId);
    expect(event.actor).toEqual(actor);
    expect(event.payload).toEqual({ foo: 'bar' });
  });

  it('sets version to "1.0"', () => {
    const event = createEvent('x', tenantId, correlationId, actor, {});
    expect(event.version).toBe('1.0');
  });

  it('generates a unique UUID for event id', () => {
    const e1 = createEvent('x', tenantId, correlationId, actor, {});
    const e2 = createEvent('x', tenantId, correlationId, actor, {});
    expect(e1.id).toMatch(UUID_REGEX);
    expect(e2.id).toMatch(UUID_REGEX);
    expect(e1.id).not.toBe(e2.id);
  });

  it('sets timestamp to a valid ISO 8601 string close to now', () => {
    const before = Date.now();
    const event = createEvent('x', tenantId, correlationId, actor, {});
    const after = Date.now();
    expect(event.timestamp).toMatch(ISO_REGEX);
    const ts = new Date(event.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('defaults causationId to correlationId when not provided', () => {
    const event = createEvent('x', tenantId, correlationId, actor, {});
    expect(event.causationId).toBe(correlationId);
  });

  it('uses provided causationId when specified', () => {
    const causationId = '00000000-0000-0000-0000-000000000099';
    const event = createEvent('x', tenantId, correlationId, actor, {}, causationId);
    expect(event.causationId).toBe(causationId);
  });

  it('populates metadata with required fields', () => {
    const event = createEvent('x', tenantId, correlationId, actor, {});
    expect(event.metadata.schemaVersion).toBe('1.0');
    expect(event.metadata.source).toBe('galaxy-api');
    expect(event.metadata.idempotencyKey).toMatch(UUID_REGEX);
  });

  it('generates unique idempotencyKey per call', () => {
    const e1 = createEvent('x', tenantId, correlationId, actor, {});
    const e2 = createEvent('x', tenantId, correlationId, actor, {});
    expect(e1.metadata.idempotencyKey).not.toBe(e2.metadata.idempotencyKey);
  });

  it('works with non-object payload (number)', () => {
    const event = createEvent('x', tenantId, correlationId, actor, 42);
    expect(event.payload).toBe(42);
  });

  it('works with null payload', () => {
    const event = createEvent<null>('x', tenantId, correlationId, actor, null);
    expect(event.payload).toBeNull();
  });

  it('works with array payload', () => {
    const event = createEvent('x', tenantId, correlationId, actor, [1, 2, 3]);
    expect(event.payload).toEqual([1, 2, 3]);
  });

  it('preserves actor type and id exactly', () => {
    const systemActor = { type: 'system' as const, id: 'galaxy-api' };
    const event = createEvent('x', tenantId, correlationId, systemActor, {});
    expect(event.actor.type).toBe('system');
    expect(event.actor.id).toBe('galaxy-api');
  });

  it('preserves agent actor', () => {
    const agentActor = { type: 'agent' as const, id: 'agent-007' };
    const event = createEvent('loop.completed', tenantId, correlationId, agentActor, {});
    expect(event.actor.type).toBe('agent');
  });
});

// ─── newCorrelationId ─────────────────────────────────────────────────────────

describe('newCorrelationId', () => {
  it('returns a valid UUID v4', () => {
    const id = newCorrelationId();
    expect(id).toMatch(UUID_REGEX);
  });

  it('returns a unique value each call', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newCorrelationId()));
    expect(ids.size).toBe(20);
  });
});
