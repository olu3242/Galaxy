import type { Pool } from 'pg';
import type {
  EconomyTransaction,
  EconomyTransactionRow,
  EconomyAccountType,
  EconomyTransactionType,
} from '../types.js';

function rowToTx(row: EconomyTransactionRow): EconomyTransaction {
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountType: row.account_type as EconomyAccountType,
    transactionType: row.transaction_type as EconomyTransactionType,
    amount: parseFloat(row.amount),
    description: row.description,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

export interface EarnInput {
  organizationId: string;
  accountType: EconomyAccountType;
  transactionType: EconomyTransactionType;
  amount: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  correlationId?: string;
}

export interface SpendInput extends EarnInput {
  allowNegative?: boolean;
}

export class EconomyTransactionService {
  constructor(private readonly pool: Pool) {}

  async earn(input: EarnInput): Promise<EconomyTransaction> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO economy_accounts (organization_id, account_type)
         VALUES ($1, $2)
         ON CONFLICT (organization_id, account_type) DO NOTHING`,
        [input.organizationId, input.accountType],
      );
      await client.query(
        `UPDATE economy_accounts
         SET balance = balance + $3, total_earned = total_earned + $3, updated_at = NOW()
         WHERE organization_id = $1 AND account_type = $2`,
        [input.organizationId, input.accountType, input.amount],
      );
      const result = await client.query<EconomyTransactionRow>(
        `INSERT INTO economy_transactions
           (organization_id, account_type, transaction_type, amount, description, reference_type, reference_id, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          input.organizationId,
          input.accountType,
          input.transactionType,
          input.amount,
          input.description,
          input.referenceType ?? null,
          input.referenceId ?? null,
          input.correlationId ?? null,
        ],
      );
      await client.query('COMMIT');
      const row = result.rows[0];
      if (!row) throw new Error('Failed to record earn transaction');
      return rowToTx(row);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async spend(input: SpendInput): Promise<EconomyTransaction> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const balanceResult = await client.query<{ balance: string }>(
        'SELECT balance FROM economy_accounts WHERE organization_id = $1 AND account_type = $2 FOR UPDATE',
        [input.organizationId, input.accountType],
      );
      const balRow = balanceResult.rows[0];
      const balance = balRow ? parseFloat(balRow.balance) : 0;
      if (!input.allowNegative && balance < input.amount) {
        await client.query('ROLLBACK');
        throw new Error(
          `Insufficient balance: have ${String(balance)}, need ${String(input.amount)}`,
        );
      }
      await client.query(
        `INSERT INTO economy_accounts (organization_id, account_type)
         VALUES ($1, $2)
         ON CONFLICT (organization_id, account_type) DO NOTHING`,
        [input.organizationId, input.accountType],
      );
      await client.query(
        `UPDATE economy_accounts
         SET balance = balance - $3, total_spent = total_spent + $3, updated_at = NOW()
         WHERE organization_id = $1 AND account_type = $2`,
        [input.organizationId, input.accountType, input.amount],
      );
      const result = await client.query<EconomyTransactionRow>(
        `INSERT INTO economy_transactions
           (organization_id, account_type, transaction_type, amount, description, reference_type, reference_id, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          input.organizationId,
          input.accountType,
          input.transactionType,
          input.amount,
          input.description,
          input.referenceType ?? null,
          input.referenceId ?? null,
          input.correlationId ?? null,
        ],
      );
      await client.query('COMMIT');
      const row = result.rows[0];
      if (!row) throw new Error('Failed to record spend transaction');
      return rowToTx(row);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getHistory(
    organizationId: string,
    accountType?: EconomyAccountType,
    limit = 50,
  ): Promise<EconomyTransaction[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    let query = 'SELECT * FROM economy_transactions WHERE organization_id = $1';
    const params: unknown[] = [organizationId];
    if (accountType) {
      params.push(accountType);
      query += ` AND account_type = $${String(params.length)}`;
    }
    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${String(params.length)}`;
    const result = await this.pool.query<EconomyTransactionRow>(query, params);
    return result.rows.map(rowToTx);
  }
}
