import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { PartnerDealService } from '../deals/PartnerDealService.js';

const ORG = '00000000-0000-0000-0000-000000000005';
const PARTNER_ID = 'partner-1';
const DEAL_ID = 'deal-1';

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

const makeDealRow = (overrides: Record<string, unknown> = {}) => ({
  id: DEAL_ID,
  partner_id: PARTNER_ID,
  customer_org_name: 'Beta Corp',
  customer_email: 'beta@corp.com',
  deal_value: '10000',
  stage: 'registered',
  commission_rate: '0.08',
  commission_amount: '800',
  notes: 'Big deal',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('PartnerDealService.registerDeal', () => {
  it('computes commission and inserts deal', async () => {
    const row = makeDealRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerDealService(pool);
    const result = await svc.registerDeal({
      partnerId: PARTNER_ID,
      organizationId: ORG,
      customerOrgName: 'Beta Corp',
      customerEmail: 'beta@corp.com',
      dealValue: 10000,
      notes: 'Big deal',
      partnerTier: 'silver',
    });
    expect(result.dealValue).toBe(10000);
    expect(result.commissionRate).toBe(0.08);
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    // call 0 setTenant, call 1 insert
    const insertParams = calls[1]?.[1] ?? [];
    expect(insertParams).toContain(0.08);
    expect(insertParams).toContain(800); // 10000 * 0.08
  });

  it('defaults to registered tier commission rate (5%)', async () => {
    const row = makeDealRow({ commission_rate: '0.05', commission_amount: '500' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerDealService(pool);
    await svc.registerDeal({
      partnerId: PARTNER_ID,
      organizationId: ORG,
      customerOrgName: 'X',
      customerEmail: 'x@x.com',
      dealValue: 10000,
      notes: '',
    });
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[1]?.[1]).toContain(0.05);
  });

  it('throws when insert returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PartnerDealService(pool);
    await expect(
      svc.registerDeal({
        partnerId: PARTNER_ID,
        organizationId: ORG,
        customerOrgName: 'X',
        customerEmail: 'x@x.com',
        dealValue: 1000,
        notes: '',
      }),
    ).rejects.toThrow('Failed to register deal');
  });
});

describe('PartnerDealService.getDeal', () => {
  it('returns deal when found via join', async () => {
    const row = makeDealRow();
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerDealService(pool);
    const result = await svc.getDeal(ORG, DEAL_ID);
    expect(result?.id).toBe(DEAL_ID);
    expect(result?.customerOrgName).toBe('Beta Corp');
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PartnerDealService(pool);
    const result = await svc.getDeal(ORG, 'missing');
    expect(result).toBeNull();
  });
});

describe('PartnerDealService.listDeals', () => {
  it('returns all deals for partner', async () => {
    const rows = [makeDealRow(), makeDealRow({ id: 'd-2' })];
    const pool = makePool([ok([]), ok(rows)]);
    const svc = new PartnerDealService(pool);
    const result = await svc.listDeals(ORG, PARTNER_ID);
    expect(result).toHaveLength(2);
  });
});

describe('PartnerDealService.updateDealStage', () => {
  it('updates stage and returns deal', async () => {
    const row = makeDealRow({ stage: 'qualified' });
    const pool = makePool([ok([]), ok([row])]);
    const svc = new PartnerDealService(pool);
    const result = await svc.updateDealStage(ORG, DEAL_ID, 'qualified');
    expect(result?.stage).toBe('qualified');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[1]?.[0]).toContain('SET stage = $2');
  });

  it('returns null when deal not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new PartnerDealService(pool);
    const result = await svc.updateDealStage(ORG, 'missing', 'proposal');
    expect(result).toBeNull();
  });

  it('inserts commission when stage is closed_won', async () => {
    const row = makeDealRow({ stage: 'closed_won' });
    const pool = makePool([ok([]), ok([row]), ok([])]);
    const svc = new PartnerDealService(pool);
    await svc.updateDealStage(ORG, DEAL_ID, 'closed_won');
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[2]?.[0]).toContain('INSERT INTO partner_commissions');
  });
});

describe('PartnerDealService.listCommissions', () => {
  it('returns commissions via join', async () => {
    const commissionRow = {
      id: 'comm-1',
      partner_id: PARTNER_ID,
      deal_id: DEAL_ID,
      amount: '800',
      status: 'pending',
      period: '2024-06',
      created_at: '2024-06-01T00:00:00Z',
    };
    const pool = makePool([ok([]), ok([commissionRow])]);
    const svc = new PartnerDealService(pool);
    const result = await svc.listCommissions(ORG, PARTNER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe(800);
    expect(result[0]?.status).toBe('pending');
  });
});
