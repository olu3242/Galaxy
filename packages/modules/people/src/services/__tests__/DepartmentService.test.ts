import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { DepartmentService } from '../DepartmentService.js';

function makePool(rows: unknown[] = []): Pool {
  const query = vi
    .fn()
    .mockResolvedValue({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });
  return { query } as unknown as Pool;
}

const deptRow = {
  id: '00000000-0000-0000-0000-000000000020',
  organization_id: '00000000-0000-0000-0000-000000000001',
  parent_department_id: null,
  name: 'Engineering',
  head_member_id: null,
  status: 'active',
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('DepartmentService', () => {
  let pool: Pool;
  let service: DepartmentService;

  beforeEach(() => {
    pool = makePool([deptRow]);
    service = new DepartmentService(pool);
  });

  describe('create', () => {
    it('sets tenant context before inserting', async () => {
      await service.create({
        organizationId: deptRow.organization_id,
        name: 'Engineering',
        correlationId: '00000000-0000-0000-0000-000000000099',
        actorId: 'system',
      });

      const query = pool.query as ReturnType<typeof vi.fn>;
      const firstCall = query.mock.calls[0] as [string, string[]];
      expect(firstCall[0]).toContain('set_config');
      expect(firstCall[1]).toContain('app.current_tenant');
    });

    it('returns mapped department', async () => {
      const dept = await service.create({
        organizationId: deptRow.organization_id,
        name: 'Engineering',
        correlationId: '00000000-0000-0000-0000-000000000099',
        actorId: 'system',
      });

      expect(dept.id).toBe(deptRow.id);
      expect(dept.name).toBe('Engineering');
      expect(dept.status).toBe('active');
      expect(dept.parentDepartmentId).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      const emptyPool = makePool([]);
      const emptyService = new DepartmentService(emptyPool);
      const result = await emptyService.getById('org-id', 'dept-id');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns array of departments', async () => {
      const depts = await service.list(deptRow.organization_id);
      expect(depts).toHaveLength(1);
      expect(depts[0]?.name).toBe('Engineering');
    });
  });
});
