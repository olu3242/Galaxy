import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { AuditRepository } from '../AuditRepository.js';
import { AuditService } from '../AuditService.js';

function makePool(rows: unknown[] = []): Pool {
  const query = vi
    .fn()
    .mockResolvedValue({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });
  return { query } as unknown as Pool;
}

const auditRow = {
  id: 1,
  organization_id: '00000000-0000-0000-0000-000000000001',
  actor_type: 'system',
  actor_id: null,
  action: 'organization.created',
  resource_type: 'organization',
  resource_id: '00000000-0000-0000-0000-000000000001',
  old_value: null,
  new_value: null,
  ip_address: null,
  correlation_id: '00000000-0000-0000-0000-000000000099',
  causation_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('AuditRepository', () => {
  let pool: Pool;
  let repo: AuditRepository;

  beforeEach(() => {
    pool = makePool([auditRow]);
    repo = new AuditRepository(pool);
  });

  it('sets tenant context before inserting', async () => {
    await repo.insert({
      organizationId: auditRow.organization_id,
      actorType: 'system',
      action: 'organization.created',
      correlationId: auditRow.correlation_id,
    });

    const query = pool.query as ReturnType<typeof vi.fn>;
    const firstCall = query.mock.calls[0] as [string, string[]];
    expect(firstCall[0]).toContain('set_config');
    expect(firstCall[1]).toContain('app.current_tenant');
  });

  it('returns correctly mapped AuditLogEntry', async () => {
    const entry = await repo.insert({
      organizationId: auditRow.organization_id,
      actorType: 'system',
      action: 'organization.created',
      correlationId: auditRow.correlation_id,
    });

    expect(entry.id).toBe(1);
    expect(entry.organizationId).toBe(auditRow.organization_id);
    expect(entry.action).toBe('organization.created');
  });

  it('throws when update is called', () => {
    expect(() => repo.update()).toThrow('UPDATE operations are not permitted');
  });

  it('throws when delete is called', () => {
    expect(() => repo.delete()).toThrow('DELETE operations are not permitted');
  });
});

describe('AuditService', () => {
  it('delegates to repository and returns entry', async () => {
    const pool = makePool([auditRow]);
    const repo = new AuditRepository(pool);
    const service = new AuditService(repo);

    const entry = await service.record({
      organizationId: auditRow.organization_id,
      actorType: 'system',
      action: 'organization.created',
      correlationId: auditRow.correlation_id,
    });

    expect(entry.action).toBe('organization.created');
  });
});
