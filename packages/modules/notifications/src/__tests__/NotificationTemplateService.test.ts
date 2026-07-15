/**
 * NotificationTemplateService unit tests
 *
 * Covers: create · getById · update · delete · list · renderTemplate (pure fn)
 *
 * All DB calls are mocked — no real database.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { NotificationTemplateService, renderTemplate } from '../services/NotificationTemplateService.js';
import type { NotificationTemplateRow } from '../types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ORG = '00000000-0000-0000-0000-000000000001';
const TMPL_ID = '00000000-0000-0000-0000-000000000010';
const CREATOR = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

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

function templateRow(overrides: Partial<NotificationTemplateRow> = {}): NotificationTemplateRow {
  return {
    id: TMPL_ID,
    organization_id: ORG,
    name: 'Welcome',
    description: null,
    channel: 'in_app',
    subject: null,
    body: 'Welcome, {{name}}!',
    variables: ['name'],
    is_active: true,
    created_by: CREATOR,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─── renderTemplate (pure) ───────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('substitutes known variables', () => {
    expect(renderTemplate('Hello, {{name}}!', { name: 'Alice' })).toBe('Hello, Alice!');
  });

  it('leaves unknown placeholders intact', () => {
    expect(renderTemplate('Hello, {{name}}!', {})).toBe('Hello, {{name}}!');
  });

  it('handles multiple variables', () => {
    const result = renderTemplate('Hi {{first}} {{last}}', { first: 'John', last: 'Doe' });
    expect(result).toBe('Hi John Doe');
  });

  it('handles a template with no placeholders', () => {
    expect(renderTemplate('No variables here.', { name: 'Alice' })).toBe('No variables here.');
  });

  it('handles repeated placeholders', () => {
    expect(renderTemplate('{{x}} + {{x}}', { x: '1' })).toBe('1 + 1');
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('NotificationTemplateService.create', () => {
  it('sets tenant context then inserts and returns the template', async () => {
    const row = templateRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationTemplateService(pool);

    const result = await svc.create({
      organizationId: ORG,
      name: 'Welcome',
      channel: 'in_app',
      body: 'Welcome, {{name}}!',
      variables: ['name'],
      createdBy: CREATOR,
    });

    expect(result.id).toBe(TMPL_ID);
    expect(result.name).toBe('Welcome');
    expect(result.isActive).toBe(true);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG],
    );
  });

  it('throws ZodError for invalid channel', async () => {
    const pool = makePool([]);
    const svc = new NotificationTemplateService(pool);

    await expect(
      svc.create({
        organizationId: ORG,
        name: 'Bad',
        channel: 'fax',
        body: 'Body',
        createdBy: CREATOR,
      }),
    ).rejects.toThrow();
  });

  it('throws ZodError for empty name', async () => {
    const pool = makePool([]);
    const svc = new NotificationTemplateService(pool);

    await expect(
      svc.create({
        organizationId: ORG,
        name: '',
        channel: 'email',
        body: 'Body',
        createdBy: CREATOR,
      }),
    ).rejects.toThrow();
  });

  it('throws when INSERT RETURNING returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    await expect(
      svc.create({
        organizationId: ORG,
        name: 'Welcome',
        channel: 'in_app',
        body: 'Hello!',
        createdBy: CREATOR,
      }),
    ).rejects.toThrow('INSERT RETURNING returned no row');
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe('NotificationTemplateService.getById', () => {
  it('returns the template when found', async () => {
    const row = templateRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationTemplateService(pool);

    const result = await svc.getById(ORG, TMPL_ID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(TMPL_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    const result = await svc.getById(ORG, TMPL_ID);
    expect(result).toBeNull();
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    await svc.getById(ORG, TMPL_ID);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG],
    );
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('NotificationTemplateService.update', () => {
  it('returns the updated template', async () => {
    const row = templateRow({ name: 'Updated Name', is_active: false });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationTemplateService(pool);

    const result = await svc.update(ORG, TMPL_ID, { name: 'Updated Name', isActive: false });
    expect(result.name).toBe('Updated Name');
    expect(result.isActive).toBe(false);
  });

  it('sets tenant context before updating', async () => {
    const row = templateRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new NotificationTemplateService(pool);

    await svc.update(ORG, TMPL_ID, { name: 'New Name' });

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG],
    );
  });

  it('throws when UPDATE RETURNING returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    await expect(svc.update(ORG, TMPL_ID, { name: 'New Name' })).rejects.toThrow(
      'UPDATE RETURNING returned no row',
    );
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('NotificationTemplateService.delete', () => {
  it('sets tenant context then issues DELETE', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    await svc.delete(ORG, TMPL_ID);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG],
    );
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('resolves without throwing when template not found (no RETURNING check)', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    await expect(svc.delete(ORG, TMPL_ID)).resolves.toBeUndefined();
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('NotificationTemplateService.list', () => {
  it('returns all templates for the org', async () => {
    const rows = [templateRow(), templateRow({ id: '00000000-0000-0000-0000-000000000011', name: 'Goodbye' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new NotificationTemplateService(pool);

    const result = await svc.list(ORG);
    expect(result).toHaveLength(2);
    expect(result[0]?.organizationId).toBe(ORG);
  });

  it('returns empty array when no templates exist', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    const result = await svc.list(ORG);
    expect(result).toEqual([]);
  });

  it('sets tenant context before querying', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new NotificationTemplateService(pool);

    await svc.list(ORG);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', ORG],
    );
  });
});
