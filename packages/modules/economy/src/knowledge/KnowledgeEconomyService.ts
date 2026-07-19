import type { Pool } from 'pg';
import type { EconomyTransaction } from '../types.js';
import { EconomyTransactionService } from '../transactions/EconomyTransactionService.js';

export class KnowledgeEconomyService {
  private readonly txService: EconomyTransactionService;

  constructor(private readonly pool: Pool) {
    this.txService = new EconomyTransactionService(pool);
  }

  async rewardContribution(
    organizationId: string,
    documentId: string,
    amount: number,
    correlationId?: string,
  ): Promise<EconomyTransaction> {
    return this.txService.earn({
      organizationId,
      accountType: 'knowledge_rewards',
      transactionType: 'reward',
      amount,
      description: `Knowledge contribution reward for document ${documentId}`,
      referenceType: 'knowledge_document',
      referenceId: documentId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  async chargeKnowledgeQuery(
    organizationId: string,
    queryId: string,
    amount: number,
    correlationId?: string,
  ): Promise<EconomyTransaction> {
    return this.txService.spend({
      organizationId,
      accountType: 'knowledge_rewards',
      transactionType: 'charge',
      amount,
      description: `Charge for knowledge query ${queryId}`,
      referenceType: 'knowledge_query',
      referenceId: queryId,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  async getKnowledgeEarnings(organizationId: string, limit = 100): Promise<EconomyTransaction[]> {
    return this.txService.getHistory(organizationId, 'knowledge_rewards', limit);
  }
}
