import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { SolutionPackTemplateService } from '../SolutionPackTemplateService.js';
import type { SolutionPackTemplateRow } from '../types.js';

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

const ORG = 'org-templates';

function makeTemplateRow(
  overrides: Partial<SolutionPackTemplateRow> = {},
): SolutionPackTemplateRow {
  return {
    id: 'tmpl-1',
    organization_id: ORG,
    name: 'Onboarding Template',
    industry: 'fintech',
    description: 'Standard onboarding',
    steps: { step1: 'collect_info', step2: 'verify' },
    category: 'onboarding',
    is_system: false,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SolutionPackTemplateService', () => {
  describe('createTemplate', () => {
    it('sets tenant context when organizationId is provided', async () => {
      const row = makeTemplateRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new SolutionPackTemplateService(pool);
      await svc.createTemplate({
        organizationId: ORG,
        name: 'Onboarding',
        description: 'desc',
        steps: {},
        category: 'onboarding',
      });
      const calls = vi.mocked(pool.query).mock.calls;
      expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(calls[0]?.[1]).toEqual(['app.current_tenant', ORG]);
    });

    it('skips tenant context for system templates (no organizationId)', async () => {
      const row = makeTemplateRow({ organization_id: null, is_system: true });
      const pool = makePool([ok([row])]);
      const svc = new SolutionPackTemplateService(pool);
      const template = await svc.createTemplate({
        name: 'System Template',
        description: 'sys desc',
        steps: {},
        category: 'system',
        isSystem: true,
      });
      const calls = vi.mocked(pool.query).mock.calls;
      // only 1 query: the INSERT (no set_config)
      expect(calls).toHaveLength(1);
      expect(template.isSystem).toBe(true);
    });

    it('returns mapped template with correct fields', async () => {
      const row = makeTemplateRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new SolutionPackTemplateService(pool);
      const template = await svc.createTemplate({
        organizationId: ORG,
        name: 'Onboarding',
        industry: 'fintech',
        description: 'desc',
        steps: { step1: 'go' },
        category: 'onboarding',
      });
      expect(template.id).toBe('tmpl-1');
      expect(template.industry).toBe('fintech');
      expect(template.steps).toEqual({ step1: 'collect_info', step2: 'verify' });
    });

    it('throws when insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SolutionPackTemplateService(pool);
      await expect(
        svc.createTemplate({
          organizationId: ORG,
          name: 'X',
          description: 'D',
          steps: {},
          category: 'X',
        }),
      ).rejects.toThrow('Failed to create');
    });
  });

  describe('listTemplates', () => {
    it('sets tenant context and returns templates', async () => {
      const rows = [
        makeTemplateRow(),
        makeTemplateRow({ id: 'tmpl-2', organization_id: null, is_system: true }),
      ];
      const pool = makePool([ok([]), ok(rows)]);
      const svc = new SolutionPackTemplateService(pool);
      const templates = await svc.listTemplates(ORG);
      expect(templates).toHaveLength(2);
    });
  });

  describe('getTemplate', () => {
    it('returns template when found', async () => {
      const row = makeTemplateRow();
      const pool = makePool([ok([]), ok([row])]);
      const svc = new SolutionPackTemplateService(pool);
      const template = await svc.getTemplate(ORG, 'tmpl-1');
      expect(template?.id).toBe('tmpl-1');
    });

    it('returns undefined when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SolutionPackTemplateService(pool);
      const template = await svc.getTemplate(ORG, 'missing');
      expect(template).toBeUndefined();
    });
  });

  describe('applyTemplate', () => {
    it('returns template application with given workflow name', async () => {
      const row = makeTemplateRow({ steps: { step1: 'begin', step2: 'end' } });
      // getTemplate: set_config + SELECT
      const pool = makePool([ok([]), ok([row])]);
      const svc = new SolutionPackTemplateService(pool);
      const applied = await svc.applyTemplate(ORG, 'tmpl-1', 'My Workflow');
      expect(applied.templateId).toBe('tmpl-1');
      expect(applied.workflowName).toBe('My Workflow');
      expect(applied.steps).toEqual({ step1: 'begin', step2: 'end' });
    });

    it('throws when template not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new SolutionPackTemplateService(pool);
      await expect(svc.applyTemplate(ORG, 'missing', 'X')).rejects.toThrow('not found');
    });
  });
});
