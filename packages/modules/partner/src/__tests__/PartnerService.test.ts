import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PartnerService } from '../partners/PartnerService.js';

const ORG = '00000000-0000-0000-0000-000000000005';
const PARTNER_ID = 'partner-1';

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

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: PARTNER_ID,
  organization_id: ORG,
  name: 'Acme Partners',
  type: 'reseller',
  tier: 'silver',
  status: 'pending',
  contact_email: 'contact@acme.com',
  contact_name: 'Jane Doe',
  approved_by: null,
  approved_at: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('PartnerService.registerPartner', () => {
  it('sets tenant context and inserts partner', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerService(pool);
    const result = await svc.registerPartner({
      organizationId: ORG,
      name: 'Acme Partners',
      type: 'reseller',
      tier: 'silver',
      contactEmail: 'contact@acme.com',
      contactName: 'Jane Doe',
    });
    expect(result.name).toBe('Acme Partners');
    expect(result.status).toBe('pending');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[0]?.[0]).toBe('SELECT set_config($1, $2, true)');
    expect(calls[1]?.[0]).toContain("'pending'");
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PartnerService(pool);
    await expect(
      svc.registerPartner({
        organizationId: ORG,
        name: 'X',
        type: 'isv',
        tier: 'registered',
        contactEmail: 'a@b.com',
        contactName: 'A',
      }),
    ).rejects.toThrow('Failed to register partner');
  });
});

describe('PartnerService.getPartner', () => {
  it('returns partner when found', async () => {
    const row = makeRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerService(pool);
    const result = await svc.getPartner(ORG, PARTNER_ID);
    expect(result?.id).toBe(PARTNER_ID);
    expect(result?.type).toBe('reseller');
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PartnerService(pool);
    const result = await svc.getPartner(ORG, 'missing');
    expect(result).toBeNull();
  });
});

describe('PartnerService.listPartners', () => {
  it('returns all partners with no filters', async () => {
    const rows = [makeRow(), makeRow({ id: 'p-2', name: 'Beta Corp' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new PartnerService(pool);
    const result = await svc.listPartners(ORG);
    expect(result).toHaveLength(2);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    expect(calls[1]?.[0]).not.toContain('WHERE');
  });

  it('adds WHERE clause with status filter', async () => {
    const pool = makePool([ok([]), ok([makeRow({ status: 'approved' })])]);
    const svc = new PartnerService(pool);
    await svc.listPartners(ORG, { status: 'approved' });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('WHERE');
    expect(calls[1]?.[0]).toContain('status = $');
    expect(calls[1]?.[1]).toContain('approved');
  });
});

describe('PartnerService.approvePartner', () => {
  it('sets status to approved and records approver', async () => {
    const row = makeRow({ status: 'approved', approved_by: 'admin-1', approved_at: '2024-06-01' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerService(pool);
    const result = await svc.approvePartner(ORG, PARTNER_ID, 'admin-1');
    expect(result?.status).toBe('approved');
    expect(result?.approvedBy).toBe('admin-1');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    expect(calls[1]?.[0]).toContain("'approved'");
  });

  it('returns null when partner not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PartnerService(pool);
    const result = await svc.approvePartner(ORG, 'missing', 'admin-1');
    expect(result).toBeNull();
  });
});

describe('PartnerService.rejectPartner', () => {
  it('sets status to rejected', async () => {
    const row = makeRow({ status: 'rejected' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerService(pool);
    const result = await svc.rejectPartner(ORG, PARTNER_ID);
    expect(result?.status).toBe('rejected');
  });
});

describe('PartnerService.updatePartnerProfile', () => {
  it('updates name when provided', async () => {
    const row = makeRow({ name: 'New Name' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerService(pool);
    const result = await svc.updatePartnerProfile(ORG, PARTNER_ID, { name: 'New Name' });
    expect(result?.name).toBe('New Name');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
    expect(calls[1]?.[0]).toContain('name = $');
  });

  it('falls back to getPartner when no fields provided', async () => {
    const row = makeRow();
    // updatePartnerProfile with no fields -> getPartner (setTenant + SELECT)
    const pool = makePool([ok([]), ok([]), ok([row])]);
    const svc = new PartnerService(pool);
    const result = await svc.updatePartnerProfile(ORG, PARTNER_ID, {});
    expect(result?.id).toBe(PARTNER_ID);
  });
});
