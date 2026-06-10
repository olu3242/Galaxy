# Platform Admin Architecture

## Overview

The Platform Admin module (`@galaxy/platform-admin`) provides comprehensive platform-level administration capabilities for Galaxy Loop OS. It covers tenant lifecycle management, feature flagging, configuration management, observability, audit logging, and support tooling.

## Module Structure

```
packages/modules/platform-admin/src/
├── PlatformAdminService.ts          # Workstream A: Org & user directory, health summary
├── PlatformDashboardService.ts      # Workstream A: Aggregate platform metrics
├── tenants/
│   ├── TenantAdminService.ts        # Tenant CRUD (legacy)
│   └── TenantOperationsService.ts   # Workstream B: Full tenant lifecycle operations
├── lifecycle/
│   ├── OrganizationLifecycleService.ts  # Workstream C: Onboarding → mature → offboarding
│   └── ReadinessScoringService.ts       # Workstream C: 0-100 readiness scoring
├── feature-flags/
│   └── FeatureFlagService.ts        # Workstream D: Feature flag CRUD and evaluation
├── features/
│   └── EntitlementService.ts        # Workstream D: Plan-based entitlement mapping
├── config/
│   ├── SystemConfigService.ts       # Workstream E: Global system config
│   └── ConfigurationService.ts      # Workstream E: Org-level scoped configuration
├── observability/
│   ├── MetricsService.ts            # Workstream F: Platform and tenant metrics
│   └── PlatformHealthService.ts     # Workstream F: Health checks and SLO tracking
├── audit/
│   ├── AuditService.ts              # Workstream G: Platform-level audit logs (INSERT-only)
│   └── SupportService.ts            # Workstream G: Support ticket management
├── actions/
│   └── AdminActionLogService.ts     # Admin action history
└── db/migrations/
    ├── 001_tenants.ts               # tenant_limits, tenant_settings, tenant_health, tenant_lifecycle, tenant_usage
    ├── 002_features.ts              # feature_entitlements, org_feature_overrides
    ├── 003_configuration.ts         # org_configurations, dept_configurations
    └── 004_audit_support.ts         # platform_audit_logs, support_tickets, support_notes
```

## Key Design Principles

### 1. Tenant Lifecycle State Machine
Tenants progress through: `provisioning → active → suspended → reactivated → archived`.
All transitions are logged in `tenant_lifecycle` for full auditability.

### 2. Feature Entitlement Hierarchy
Feature access is resolved in order:
1. Org-level override (`org_feature_overrides`) — takes precedence
2. Plan-tier entitlement (`feature_entitlements`)
3. Default deny

### 3. Configuration Scopes
Org configurations are namespaced by `scope`: `workflow | approval | notification | security | policy`.
Department-level overrides inherit from org-level.

### 4. Observability
- `MetricsService` aggregates cross-tenant platform metrics
- `PlatformHealthService` runs real-time health checks and computes SLOs

### 5. Audit Log Immutability
`platform_audit_logs` is INSERT-only. Application code never performs UPDATE or DELETE on this table.

## API Routes

All routes registered under `/api/v1/admin/v2/...` with `x-admin-secret` header authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/v2/dashboard | Aggregate platform metrics |
| GET | /admin/v2/health | Platform health summary |
| GET | /admin/v2/orgs | Org directory |
| POST | /admin/v2/tenants | Create tenant |
| POST | /admin/v2/tenants/:orgId/provision | Provision tenant |
| POST | /admin/v2/tenants/:orgId/activate | Activate tenant |
| POST | /admin/v2/tenants/:orgId/suspend | Suspend tenant |
| POST | /admin/v2/tenants/:orgId/reactivate | Reactivate tenant |
| POST | /admin/v2/tenants/:orgId/archive | Archive tenant |
| GET | /admin/v2/orgs/:orgId/lifecycle | Lifecycle state |
| GET | /admin/v2/orgs/:orgId/readiness | Readiness score |
| GET | /admin/v2/entitlements/:planTier | Plan entitlements |
| POST | /admin/v2/entitlements | Upsert entitlement |
| POST | /admin/v2/orgs/:orgId/feature-overrides | Set org feature override |
| GET | /admin/v2/orgs/:orgId/config | List org configs |
| PUT | /admin/v2/orgs/:orgId/config/:scope/:key | Set org config |
| GET | /admin/v2/metrics/platform | Platform metrics |
| GET | /admin/v2/metrics/tenant/:orgId | Tenant metrics |
| GET | /admin/v2/health-checks | Run health checks |
| GET | /admin/v2/audit-logs | Query audit logs |
| GET | /admin/v2/support/tickets | List support tickets |
| POST | /admin/v2/support/tickets | Create support ticket |
| PATCH | /admin/v2/support/tickets/:ticketId/status | Update ticket status |
| POST | /admin/v2/support/tickets/:ticketId/notes | Add ticket note |
