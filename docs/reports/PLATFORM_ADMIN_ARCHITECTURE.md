# Platform Admin Architecture

## Overview

The Platform Admin module (`@galaxy/platform`, workstreams A and B) provides global administrative capabilities for Galaxy operators who manage the entire multi-tenant platform. Unlike tenant-scoped modules, the admin layer operates without Row-Level Security constraints and has direct access to cross-tenant data for operational oversight.

## Services

**PlatformAdminService** records and retrieves administrative actions in `platform_admin_actions` and platform-level metrics in `platform_admin_metrics`. These tables are global (no `organization_id`), intentionally bypassing RLS to allow platform operators to read and write across all tenants. The service exposes `recordAdminAction`, `listAdminActions`, `recordMetric`, and `getMetrics`.

**OrganizationRegistryService** provides a searchable directory of all organizations on the platform, returning aggregated stats (member counts, workflow counts) without setting tenant context. It includes `searchOrganizations`, `getOrgStats`, and `listOrganizations`, each querying directly from the `organizations` table.

**TenantOperationsService** manages the `tenants` table (distinct from `organizations`) for lifecycle tracking—creation, status updates, and per-tenant settings via `tenant_settings`. **TenantHealthService** records periodic health snapshots to `tenant_health` and manages resource limits in `tenant_limits`.

## API Endpoints

Routes are registered under `/api/v1/platform` and include:
- `POST /admin/metrics` — record a platform metric
- `GET /admin/metrics` — list metrics with optional filters
- `GET /tenants`, `POST /tenants`, `GET /tenants/:tenantId` — tenant CRUD
