export type EconomyAccountType =
  | 'publisher_earnings'
  | 'workflow_credits'
  | 'agent_credits'
  | 'knowledge_rewards'
  | 'platform_fees';

export type EconomyTransactionType =
  | 'earn'
  | 'spend'
  | 'royalty'
  | 'reward'
  | 'charge'
  | 'settlement'
  | 'refund';

export interface EconomyAccount {
  id: string;
  organizationId: string;
  accountType: EconomyAccountType;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface EconomyAccountRow {
  id: string;
  organization_id: string;
  account_type: string;
  balance: string;
  total_earned: string;
  total_spent: string;
  created_at: string;
  updated_at: string;
}

export interface EconomyTransaction {
  id: string;
  organizationId: string;
  accountType: EconomyAccountType;
  transactionType: EconomyTransactionType;
  amount: number;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface EconomyTransactionRow {
  id: string;
  organization_id: string;
  account_type: string;
  transaction_type: string;
  amount: string;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  correlation_id: string | null;
  created_at: string;
}

export interface AgentLedger {
  agentId: string;
  organizationId: string;
  totalCharged: number;
  totalRoyalties: number;
  transactions: EconomyTransaction[];
}

export interface SettlementSummary {
  organizationId: string;
  period: string;
  pendingAmount: number;
  transactionCount: number;
}
