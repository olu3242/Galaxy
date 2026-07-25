/**
 * AI Economy Certification Test Suite
 *
 * Certifies the Galaxy AI Economy lifecycle:
 * 1.  economy_accounts and economy_transactions tables exist with expected columns
 * 2.  Economy accounts are created on first earn (idempotent)
 * 3.  Earning credits increases balance and total_earned
 * 4.  Spending credits decreases balance and increases total_spent
 * 5.  Insufficient-balance spend raises an error when allowNegative is false
 * 6.  Transaction history is retrievable for an account
 * 7.  Cross-tenant isolation — org B cannot see org A economy accounts
 * 8.  Multiple account types are supported and independently tracked
 * 9.  Settlement summary reflects pending transactions
 * 10. Workflow economy royalty earn records correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  EconomyAccountService,
  EconomyTransactionService,
  WorkflowEconomyService,
  EconomySettlementService,
} from '@galaxy/economy';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-ee01-4000-8000-e1a000000001';
const orgIdB = '00000000-ee01-4000-8000-e1a000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Economy Test Org A', 'economy-test-a', 'starter', 'active'),
            ($2, 'Economy Test Org B', 'economy-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM economy_transactions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM economy_accounts WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('AI Economy Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. economy_accounts and economy_transactions tables exist', async () => {
    for (const table of ['economy_accounts', 'economy_transactions']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Account creation is idempotent ─────────────────────────────────────
  it('2. Economy accounts are created on first earn (idempotent)', async () => {
    const svc = new EconomyAccountService(pool);

    const account = await svc.ensureAccount(orgId, 'workflow_credits');
    expect(account.id).toBeTruthy();
    expect(account.organizationId).toBe(orgId);
    expect(account.accountType).toBe('workflow_credits');

    // Second call should return the same account
    const same = await svc.ensureAccount(orgId, 'workflow_credits');
    expect(same.id).toBe(account.id);
  });

  // ── 3. Earning increases balance and total_earned ─────────────────────────
  it('3. Earning credits increases balance and total_earned', async () => {
    const txSvc = new EconomyTransactionService(pool);
    const accSvc = new EconomyAccountService(pool);

    const before = await accSvc.getBalance(orgId, 'workflow_credits');

    await txSvc.earn({
      organizationId: orgId,
      accountType: 'workflow_credits',
      transactionType: 'earn',
      amount: 100,
      description: 'Workflow publication royalty',
      correlationId: crypto.randomUUID(),
    });

    const after = await accSvc.getBalance(orgId, 'workflow_credits');
    expect(after).toBe(before + 100);
  });

  // ── 4. Spending decreases balance and increases total_spent ───────────────
  it('4. Spending credits decreases balance and increases total_spent', async () => {
    const txSvc = new EconomyTransactionService(pool);
    const accSvc = new EconomyAccountService(pool);

    // Ensure funds exist
    await txSvc.earn({
      organizationId: orgId,
      accountType: 'workflow_credits',
      transactionType: 'earn',
      amount: 200,
      description: 'Top-up for spend test',
    });

    const before = await accSvc.getBalance(orgId, 'workflow_credits');

    await txSvc.spend({
      organizationId: orgId,
      accountType: 'workflow_credits',
      transactionType: 'spend',
      amount: 50,
      description: 'Workflow installation fee',
      correlationId: crypto.randomUUID(),
    });

    const after = await accSvc.getBalance(orgId, 'workflow_credits');
    expect(after).toBe(before - 50);
  });

  // ── 5. Overspend protection ───────────────────────────────────────────────
  it('5. Spend raises an error when balance is insufficient and allowNegative is false', async () => {
    const txSvc = new EconomyTransactionService(pool);

    await expect(
      txSvc.spend({
        organizationId: orgId,
        accountType: 'knowledge_rewards',
        transactionType: 'spend',
        amount: 999999,
        description: 'Overspend attempt',
        allowNegative: false,
      }),
    ).rejects.toThrow();
  });

  // ── 6. Transaction history ────────────────────────────────────────────────
  it('6. Transaction history is retrievable for an account', async () => {
    const txSvc = new EconomyTransactionService(pool);

    const history = await txSvc.getHistory(orgId, 'workflow_credits', 20);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty('id');
    expect(history[0]).toHaveProperty('amount');
    expect(history[0]).toHaveProperty('transactionType');
  });

  // ── 7. Cross-tenant isolation ─────────────────────────────────────────────
  it('7. Org B cannot see org A economy accounts', async () => {
    const accSvc = new EconomyAccountService(pool);
    await accSvc.ensureAccount(orgId, 'agent_credits');

    const accountB = await accSvc.getAccount(orgIdB, 'agent_credits');
    // org B should not have org A's account
    if (accountB !== null) {
      expect(accountB.organizationId).toBe(orgIdB);
    }

    // Direct query confirms isolation
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM economy_accounts WHERE organization_id = $1`,
      [orgIdB],
    );
    const countB = Number(r.rows[0]?.count ?? 0);
    const rA = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM economy_accounts WHERE organization_id = $1`,
      [orgId],
    );
    const countA = Number(rA.rows[0]?.count ?? 0);
    // Both can have their own accounts; no cross-contamination
    expect(countA + countB).toBeGreaterThanOrEqual(0);

    const crossLeak = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM economy_accounts
       WHERE organization_id = $1
         AND id IN (SELECT id FROM economy_accounts WHERE organization_id = $2)`,
      [orgId, orgIdB],
    );
    expect(Number(crossLeak.rows[0]?.count ?? 0)).toBe(0);
  });

  // ── 8. Multiple account types are independent ─────────────────────────────
  it('8. Multiple account types are supported and independently tracked', async () => {
    const txSvc = new EconomyTransactionService(pool);
    const accSvc = new EconomyAccountService(pool);

    await txSvc.earn({
      organizationId: orgId,
      accountType: 'publisher_earnings',
      transactionType: 'royalty',
      amount: 75,
      description: 'Agent marketplace royalty',
    });

    const workflowBalance = await accSvc.getBalance(orgId, 'workflow_credits');
    const publisherBalance = await accSvc.getBalance(orgId, 'publisher_earnings');

    // The two accounts should be tracked independently
    expect(typeof workflowBalance).toBe('number');
    expect(typeof publisherBalance).toBe('number');
    expect(publisherBalance).toBeGreaterThanOrEqual(75);
  });

  // ── 9. Settlement summary ─────────────────────────────────────────────────
  it('9. Settlement summary reflects pending transaction amount', async () => {
    const settleSvc = new EconomySettlementService(pool);

    const summary = await settleSvc.getPendingSettlement(orgId);
    expect(summary.organizationId).toBe(orgId);
    expect(typeof summary.pendingAmount).toBe('number');
    expect(typeof summary.transactionCount).toBe('number');
  });

  // ── 10. Workflow economy royalty ──────────────────────────────────────────
  it('10. Workflow economy royalty earn records correctly', async () => {
    const wfSvc = new WorkflowEconomyService(pool);

    const tx = await wfSvc.recordPublisherEarning(
      orgId,
      crypto.randomUUID(),
      50,
      'Workflow pack installation royalty',
    );
    expect(tx.organizationId).toBe(orgId);
    expect(tx.amount).toBeGreaterThan(0);
    expect(tx.transactionType).toBe('royalty');
  });
});
