export * from './types.js';

// Workstream A — Platform Admin Console
export { PlatformAdminService } from './PlatformAdminService.js';
export type { UserDirectoryEntry, PlatformHealthSummary } from './PlatformAdminService.js';
export { PlatformDashboardService } from './PlatformDashboardService.js';
export type { PlatformDashboardMetrics } from './PlatformDashboardService.js';

// Workstream B — Tenant Operations
export { TenantAdminService } from './tenants/TenantAdminService.js';
export { TenantOperationsService } from './tenants/TenantOperationsService.js';
export type {
  TenantRecord,
  TenantLimits,
  TenantLifecycleStatus,
  CreateTenantInput,
} from './tenants/TenantOperationsService.js';

// Workstream C — Lifecycle
export { OrganizationLifecycleService } from './lifecycle/OrganizationLifecycleService.js';
export type { LifecycleState, LifecycleStage } from './lifecycle/OrganizationLifecycleService.js';
export { ReadinessScoringService } from './lifecycle/ReadinessScoringService.js';
export type { ReadinessScore } from './lifecycle/ReadinessScoringService.js';

// Workstream D — Feature Management
export { FeatureFlagService } from './feature-flags/FeatureFlagService.js';
export { EntitlementService } from './features/EntitlementService.js';
export type { Entitlement, OrgFeatureOverride } from './features/EntitlementService.js';

// Workstream E — Configuration
export { SystemConfigService } from './config/SystemConfigService.js';
export { ConfigurationService } from './config/ConfigurationService.js';
export type { OrgConfiguration, ConfigScope } from './config/ConfigurationService.js';

// Workstream F — Observability
export { MetricsService } from './observability/MetricsService.js';
export type { TenantMetrics } from './observability/MetricsService.js';
export { PlatformHealthService } from './observability/PlatformHealthService.js';
export type {
  PlatformHealthReport,
  HealthCheck,
  HealthStatus,
} from './observability/PlatformHealthService.js';

// Workstream G — Audit & Support
export { AdminActionLogService } from './actions/AdminActionLogService.js';
export type { LogAdminActionInput } from './actions/AdminActionLogService.js';
export { AuditService } from './audit/AuditService.js';
export type { PlatformAuditLog, CreateAuditLogInput } from './audit/AuditService.js';
export { SupportService } from './audit/SupportService.js';
export type {
  SupportTicket,
  SupportNote,
  CreateTicketInput,
  TicketStatus,
  TicketPriority,
} from './audit/SupportService.js';
