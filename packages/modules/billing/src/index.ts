export * from './types.js';

// Workstream H — Billing Platform
export { BillingService } from './BillingService.js';
export type {
  BillingAccount,
  CreateBillingAccountInput,
  UpdateBillingAccountInput,
  BillingAccountStatus,
} from './BillingService.js';
export { InvoiceService } from './invoices/InvoiceService.js';
export { PaymentService } from './PaymentService.js';
export type { Payment, RecordPaymentInput } from './PaymentService.js';

// Workstream I — Subscription Management
export { SubscriptionService } from './subscriptions/SubscriptionService.js';
export { PlanService } from './subscriptions/PlanService.js';
export type { CreatePlanInput } from './subscriptions/PlanService.js';
export { TrialService } from './subscriptions/TrialService.js';
export type { Trial } from './subscriptions/TrialService.js';

// Workstream J — Usage Metering
export { UsageMeteringService } from './usage/UsageMeteringService.js';
export { QuotaService } from './usage/QuotaService.js';
export type { QuotaCheck, UsageAlert } from './usage/QuotaService.js';

// Workstream K — Revenue Operations
export { RevenueOperationsService } from './revenue/RevenueOperationsService.js';
export type { RevenueMetrics } from './revenue/RevenueOperationsService.js';
export { CustomerHealthService } from './revenue/CustomerHealthService.js';
export type { CustomerHealth } from './revenue/CustomerHealthService.js';

// Workstream L — Commercial Readiness
export { CommercialService } from './commercial/CommercialService.js';
export type { PricingConfig, BillingPolicy } from './commercial/CommercialService.js';
export { SubscriptionGovernanceService } from './commercial/SubscriptionGovernanceService.js';

// Existing services
export { PlanLimitsService } from './limits/PlanLimitsService.js';
export type { LimitCheckResult } from './limits/PlanLimitsService.js';
