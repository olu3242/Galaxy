import type { Pool } from 'pg';
import type { AgentLedger, EconomyTransaction } from '../types.js';
import { EconomyTransactionService } from '../transactions/EconomyTransactionService.js';

export class AgentEconomyService {
  private readonly txService: EconomyTransactionService;

  constructor(private readonly pool: Pool) {
    this.txService = new EconomyTransactionService(pool);
  }

  async chargeAgentExecution(
    organizationId: string,
    agentId: string,
    amount: number,
    correlationId?: string,
  ): Promise<EconomyTransaction> {
    return this.txService.spend({
      organizationId,
      accountType: 'agent_credits',
      transactionType: 'charge',
      amount,
      description: `Agent execution charge for ${agentId}`,
      referenceType: 'agent',
      referenceId: agentId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  async payPublisherRoyalty(
    organizationId: string,
    agentId: string,
    amount: number,
    correlationId?: string,
  ): Promise<EconomyTransaction> {
    return this.txService.earn({
      organizationId,
      accountType: 'publisher_earnings',
      transactionType: 'royalty',
      amount,
      description: `Royalty payment for agent ${agentId}`,
      referenceType: 'agent',
      referenceId: agentId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  async getAgentLedger(organizationId: string, agentId: string): Promise<AgentLedger> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const result = await this.pool.query<{
      transaction_type: string;
      total: string;
    }>(
      `SELECT transaction_type, SUM(amount) as total
       FROM economy_transactions
       WHERE organization_id = $1 AND reference_type = 'agent' AND reference_id = $2
       GROUP BY transaction_type`,
      [organizationId, agentId],
    );
    let totalCharged = 0;
    let totalRoyalties = 0;
    for (const row of result.rows) {
      if (row.transaction_type === 'charge') totalCharged += parseFloat(row.total);
      if (row.transaction_type === 'royalty') totalRoyalties += parseFloat(row.total);
    }
    const transactions = await this.txService.getHistory(organizationId, undefined, 100);
    const agentTx = transactions.filter(
      (t) => t.referenceType === 'agent' && t.referenceId === agentId,
    );
    return { agentId, organizationId, totalCharged, totalRoyalties, transactions: agentTx };
  }
}
