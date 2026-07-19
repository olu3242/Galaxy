export type PlanTier = 'starter' | 'professional' | 'enterprise';

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export type UsageEventType =
  | 'workflow_run'
  | 'agent_execution'
  | 'api_call'
  | 'storage_mb'
  | 'member_seat';

export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  monthlyPriceCents: number;
  annualPriceCents: number;
  limits: PlanLimits;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanLimits {
  maxMembers: number;
  maxWorkflows: number;
  maxAgents: number;
  apiCallsPerMonth: number;
  storageMb: number;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPeriod {
  start: string;
  end: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  subscriptionId: string;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  paidAt?: string;
  lineItems: InvoiceLineItem[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmountCents: number;
  totalCents: number;
}

export interface UsageEvent {
  id: string;
  organizationId: string;
  subscriptionId: string;
  eventType: UsageEventType;
  quantity: number;
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface UsageSummary {
  organizationId: string;
  subscriptionId: string;
  period: BillingPeriod;
  workflowRuns: number;
  agentExecutions: number;
  apiCalls: number;
  storageMb: number;
  memberSeats: number;
}

export interface CreateSubscriptionInput {
  organizationId: string;
  planId: string;
  trialEnd?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSubscriptionInput {
  planId?: string;
  status?: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RecordUsageInput {
  organizationId: string;
  subscriptionId: string;
  eventType: UsageEventType;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface GenerateInvoiceInput {
  organizationId: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}
