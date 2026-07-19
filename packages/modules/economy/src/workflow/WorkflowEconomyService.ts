import type { Pool } from 'pg';
import type { EconomyTransaction } from '../types.js';
import { EconomyTransactionService } from '../transactions/EconomyTransactionService.js';

export class WorkflowEconomyService {
  private readonly txService: EconomyTransactionService;

  constructor(private readonly pool: Pool) {
    this.txService = new EconomyTransactionService(pool);
  }

  async recordPublisherEarning(
    organizationId: string,
    workflowId: string,
    amount: number,
    correlationId?: string,
  ): Promise<EconomyTransaction> {
    // Anti-fraud: check for duplicate earning in same window
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const dupCheck = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM economy_transactions
       WHERE organization_id = $1 AND reference_type = 'workflow' AND reference_id = $2
         AND transaction_type = 'earn' AND created_at > NOW() - INTERVAL '1 hour'`,
      [organizationId, workflowId],
    );
    const dupRow = dupCheck.rows[0];
    if (dupRow && parseInt(dupRow.count, 10) > 0) {
      throw new Error(`Duplicate earning detected for workflow ${workflowId} within 1 hour`);
    }
    return this.txService.earn({
      organizationId,
      accountType: 'publisher_earnings',
      transactionType: 'earn',
      amount,
      description: `Publisher earning for workflow run ${workflowId}`,
      referenceType: 'workflow',
      referenceId: workflowId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  async chargeWorkflowRun(
    organizationId: string,
    workflowId: string,
    amount: number,
    correlationId?: string,
  ): Promise<EconomyTransaction> {
    return this.txService.spend({
      organizationId,
      accountType: 'workflow_credits',
      transactionType: 'charge',
      amount,
      description: `Charge for workflow run ${workflowId}`,
      referenceType: 'workflow',
      referenceId: workflowId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  async getPublisherEarnings(organizationId: string, limit = 100): Promise<EconomyTransaction[]> {
    return this.txService.getHistory(organizationId, 'publisher_earnings', limit);
  }
}
