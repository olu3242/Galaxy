import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingService } from '../BillingService.js';
import type { Pool, QueryResult } from 'pg';

function makePool(rows: unknown[][]): Pool {
  let callIdx = 0;
  const query = vi.fn().mockImplementation(() => {
    const currentRows = rows[callIdx] ?? [];
    callIdx++;
    return Promise.resolve({ rows: currentRows, rowCount: currentRows.length } as QueryResult);
  });
  return { query } as unknown as Pool;
}

const accountRow = {
  id: 'acct-1',
  organization_id: 'org-1',
  status: 'active',
  currency: 'usd',
  billing_email: 'billing@acme.com',
  billing_name: 'Acme Corp',
  billing_address: {},
  metadata: {},
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('BillingService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('createBillingAccount inserts and returns account', async () => {
    const pool = makePool([
      [],          // set_config
      [accountRow], // INSERT billing_accounts
    ]);
    const svc = new BillingService(pool);
    const account = await svc.createBillingAccount({
      organizationId: 'org-1',
      billingEmail: 'billing@acme.com',
      billingName: 'Acme Corp',
    });
    expect(account.id).toBe('acct-1');
    expect(account.status).toBe('active');
    expect(account.currency).toBe('usd');
  });

  it('getBillingAccount returns null when not found', async () => {
    const pool = makePool([[], []]);
    const svc = new BillingService(pool);
    const result = await svc.getBillingAccount('org-999');
    expect(result).toBeNull();
  });

  it('updateBillingAccount updates fields', async () => {
    const updatedRow = { ...accountRow, billing_email: 'new@acme.com' };
    const pool = makePool([
      [],            // set_config
      [updatedRow],  // UPDATE billing_accounts
    ]);
    const svc = new BillingService(pool);
    const account = await svc.updateBillingAccount('org-1', { billingEmail: 'new@acme.com' });
    expect(account?.billingEmail).toBe('new@acme.com');
  });
});
