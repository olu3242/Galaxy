import type { Pool } from 'pg';
import type { EconomyAccount, EconomyAccountRow, EconomyAccountType } from '../types.js';

function rowToAccount(row: EconomyAccountRow): EconomyAccount {
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountType: row.account_type as EconomyAccountType,
    balance: parseFloat(row.balance),
    totalEarned: parseFloat(row.total_earned),
    totalSpent: parseFloat(row.total_spent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class EconomyAccountService {
  constructor(private readonly pool: Pool) {}

  async ensureAccount(
    organizationId: string,
    accountType: EconomyAccountType,
  ): Promise<EconomyAccount> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<EconomyAccountRow>(
      `INSERT INTO economy_accounts (organization_id, account_type)
       VALUES ($1, $2)
       ON CONFLICT (organization_id, account_type) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [organizationId, accountType],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to ensure economy account');
    return rowToAccount(row);
  }

  async getAccount(
    organizationId: string,
    accountType: EconomyAccountType,
  ): Promise<EconomyAccount | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<EconomyAccountRow>(
      'SELECT * FROM economy_accounts WHERE organization_id = $1 AND account_type = $2',
      [organizationId, accountType],
    );
    const row = result.rows[0];
    return row ? rowToAccount(row) : null;
  }

  async getBalance(organizationId: string, accountType: EconomyAccountType): Promise<number> {
    const account = await this.getAccount(organizationId, accountType);
    return account ? account.balance : 0;
  }

  async listAccounts(organizationId: string): Promise<EconomyAccount[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<EconomyAccountRow>(
      'SELECT * FROM economy_accounts WHERE organization_id = $1 ORDER BY account_type',
      [organizationId],
    );
    return result.rows.map(rowToAccount);
  }
}
