// Workstream A — Platform Admin
export { PlatformAdminService } from './admin/PlatformAdminService.js';
export { OrganizationRegistryService } from './admin/OrganizationRegistryService.js';
export type { AdminActionRecord, PlatformMetricRecord } from './admin/PlatformAdminService.js';
export type { OrgRegistryEntry, OrgStats } from './admin/OrganizationRegistryService.js';

// Workstream B — Tenant Operations
export { TenantOperationsService } from './tenant/TenantOperationsService.js';
export { TenantHealthService } from './tenant/TenantHealthService.js';
export type { Tenant, TenantStatus, TenantSetting } from './tenant/TenantOperationsService.js';
export type { TenantHealth, TenantLimit } from './tenant/TenantHealthService.js';

// Workstream C — Org Lifecycle
export { OrganizationLifecycleService } from './lifecycle/OrganizationLifecycleService.js';
export { ReadinessScoringService } from './lifecycle/ReadinessScoringService.js';
export type {
  OrgLifecycleEvent,
  OrgHealthCheckpoint,
  LifecycleEventType,
} from './lifecycle/OrganizationLifecycleService.js';
export type { OrgReadinessScore } from './lifecycle/ReadinessScoringService.js';

// Workstream D — Feature Management
export { FeatureFlagService } from './features/FeatureFlagService.js';
export { EntitlementService } from './features/EntitlementService.js';
export type { FeatureFlag, FeatureEntitlement } from './features/FeatureFlagService.js';
export type { PlanFeature } from './features/EntitlementService.js';

// Workstream E — Configuration Management
export { ConfigurationService } from './config/ConfigurationService.js';
export { OrganizationSettingsService } from './config/OrganizationSettingsService.js';
export type { OrgConfiguration } from './config/ConfigurationService.js';
export type { ConfigSchema } from './config/OrganizationSettingsService.js';

// Workstream F — Platform Observability
export { MetricsService } from './observability/MetricsService.js';
export { PlatformHealthService } from './observability/PlatformHealthService.js';
export type { PlatformMetric } from './observability/MetricsService.js';
export type {
  PlatformHealthSnapshot,
  HealthStatus,
} from './observability/PlatformHealthService.js';

// Workstream G — Audit & Support
export { AuditService } from './audit/AuditService.js';
export { SupportService } from './audit/SupportService.js';
export type { AuditLogEntry } from './audit/AuditService.js';
export type {
  SupportTicket,
  AdminNote,
  TicketStatus,
  TicketPriority,
} from './audit/SupportService.js';

// Workstream H — Billing
export { BillingService } from './billing/BillingService.js';
export { InvoiceService } from './billing/InvoiceService.js';
export { PaymentService } from './billing/PaymentService.js';
export type {
  BillingAccount,
  BillingProfile,
  BillingAccountStatus,
} from './billing/BillingService.js';
export type { Invoice, InvoiceItem, InvoiceStatus } from './billing/InvoiceService.js';
export type { Payment, Credit, PaymentStatus } from './billing/PaymentService.js';

// Workstream I — Subscriptions
export { SubscriptionService } from './subscriptions/SubscriptionService.js';
export { PlanService } from './subscriptions/PlanService.js';
export { TrialService } from './subscriptions/TrialService.js';
export type {
  Subscription,
  SubscriptionStatus,
  SubscriptionEvent,
} from './subscriptions/SubscriptionService.js';
export type { Plan } from './subscriptions/PlanService.js';

// Workstream J — Usage Metering
export { UsageMeteringService } from './usage/UsageMeteringService.js';
export { QuotaService } from './usage/QuotaService.js';
export type { UsageEvent, UsageRecord } from './usage/UsageMeteringService.js';
export type { UsageLimit, UsageAlert, QuotaCheckResult } from './usage/QuotaService.js';

// Workstream K — Revenue Operations
export { RevenueOperationsService } from './revenue/RevenueOperationsService.js';
export { CustomerHealthService } from './revenue/CustomerHealthService.js';
export type { RevenueSnapshot } from './revenue/RevenueOperationsService.js';
export type { CustomerHealthScore } from './revenue/CustomerHealthService.js';

// Workstream L — Commercial Readiness
export { CommercialPolicyService } from './commercial/CommercialPolicyService.js';
export type { CommercialPolicy } from './commercial/CommercialPolicyService.js';

// Workstream M — WRF Runtime & Dependency Health
export { WorkstreamRuntimeService } from './workstream/WorkstreamRuntimeService.js';
export { DependencyHealthService } from './workstream/DependencyHealthService.js';

// Workstream N — Autonomous Operations Framework (AOF)
export { ObservabilityService } from './aof/ObservabilityService.js';
export { DecisionEngineService } from './aof/DecisionEngineService.js';
export { OptimizationEngineService } from './aof/OptimizationEngineService.js';
export { AutonomousCertificationService } from './aof/AutonomousCertificationService.js';
export { PredictiveIntelligenceService } from './aof/PredictiveIntelligenceService.js';
