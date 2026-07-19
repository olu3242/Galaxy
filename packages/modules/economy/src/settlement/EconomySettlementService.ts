import type { Pool } from 'pg';
import type { SettlementSummary } from '../types.js';

export class EconomySettlementService {
  constructor(private readonly pool: Pool) {}

  async getPendingSettlement(organizationId: string): Promise<SettlementSummary> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const result = await this.pool.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM economy_transactions
       WHERE organization_id = $1
         AND transaction_type = 'earn'
         AND created_at >= date_trunc('month', NOW())`,
      [organizationId],
    );
    const row = result.rows[0];
    return {
      organizationId,
      period,
      pendingAmount: row ? parseFloat(row.total) : 0,
      transactionCount: row ? parseInt(row.count, 10) : 0,
    };
  }

  async runSettlement(
    organizationId: string,
    period: string,
  ): Promise<{ settled: number; amount: number }> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<{ count: string; total: string }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM economy_transactions
       WHERE organization_id = $1
         AND transaction_type = 'earn'
         AND to_char(created_at, 'YYYY-MM') = $2`,
      [organizationId, period],
    );
    const row = result.rows[0];
    if (!row) return { settled: 0, amount: 0 };
    return {
      settled: parseInt(row.count, 10),
      amount: parseFloat(row.total),
    };
  }
}
