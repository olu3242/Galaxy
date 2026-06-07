# Galaxy Tenant Isolation Model

This document defines how Galaxy Loop OS achieves data isolation between tenants across three progressive isolation tiers, and specifies the mechanisms for tenant routing, context management, and cross-tenant protection.

---

## Overview

Galaxy is a multi-tenant platform where each organization's data must be completely isolated from all other organizations. A member of Organization A must never be able to read, write, or infer the existence of Organization B's data under any query path, API call, or agent action.

The default isolation tier at MVP is **Shared RLS**. The platform has a defined migration path to **Dedicated Schema** (growth tier) and **Dedicated Database** (enterprise tier) as organizations scale.

---

## Isolation Tier 1: Shared RLS (MVP Default)

### Description

All tenants share a single PostgreSQL database and a single schema. Tenant isolation is enforced exclusively at the database layer using PostgreSQL Row-Level Security (RLS) policies on every tenant-scoped table.

### How RLS Enforces Isolation

1. Every tenant-scoped table has an `organization_id UUID NOT NULL` column.
2. Before any query executes, the application sets the tenant context: `SELECT set_config('app.current_tenant', $1, true)` where `$1` is the organization's UUID.
3. Each table's RLS policy is defined as: `USING (organization_id = current_setting('app.current_tenant')::uuid)`
4. PostgreSQL evaluates this predicate for every row in every query. Rows belonging to other tenants are invisible and unmodifiable — the database returns zero results, not an error.
5. The `organizations` table itself is not RLS-protected; access is controlled at the application middleware layer.
6. The `audit_logs` table has an enhanced INSERT-only RLS policy: INSERT is allowed for the service role within the tenant context; UPDATE and DELETE are blocked for all roles.

### Guarantees

- **Read isolation:** A query executing in tenant A's context cannot return any row from tenant B, regardless of how the query is constructed.
- **Write isolation:** An INSERT, UPDATE, or DELETE can only affect rows where `organization_id` matches the current tenant context.
- **Application bypass resistance:** Even if application code contains a query bug (missing `WHERE organization_id = ...`), the RLS policy still enforces isolation.
- **SQL injection resistance:** If a tenant ID is injected via a malformed payload, the injected value is sanitized by the parameterized query driver; the RLS context was already set to the legitimate tenant's ID.

### Limitations

- Shared schema means a misconfigured or missing RLS policy on a new table is a potential cross-tenant data leak. Mitigation: mandatory cross-tenant isolation test runs in CI before any schema migration merges.
- Shared compute and storage means noisy-neighbor performance impact is possible. Mitigation: query timeouts, connection pool limits per tenant, and rate limiting at the API layer.
- Forensic queries that span tenants require the Platform Admin role and the `manage:audit` permission; these are always audit-logged.

### When to Use

Shared RLS is appropriate for organizations on the Starter and early Growth tiers where dedicated infrastructure is not economically justified.

---

## Isolation Tier 2: Dedicated Schema (Growth Tier)

### Description

A growing organization's data is migrated to its own PostgreSQL schema within the shared database cluster. The schema is named using the organization's slug: `tenant_{slug}`. RLS is still applied within the schema as a defense-in-depth measure, but the primary isolation is now at the schema boundary.

### When to Migrate

Migration to Dedicated Schema is triggered by any of the following conditions:

- Organization requests schema-level isolation as a contractual requirement
- Organization's query volume or data size causes measurable performance impact on other tenants
- Organization is processing sensitive data categories (healthcare, finance) that warrant stronger isolation
- Organization is on a Growth or Enterprise tier subscription

### Schema Naming Convention

```
tenant_{organization_slug}
```

Example: Organization with slug `acme-corp` → schema `tenant_acme_corp` (hyphens replaced with underscores).

The `search_path` for all queries in this tenant's context is set to `tenant_{slug}, public`.

### Migration Path

1. Platform Admin initiates migration in the admin console.
2. A migration job creates the new schema and copies all tables with their RLS policies.
3. Data is migrated in bulk during a maintenance window using logical replication or `INSERT ... SELECT`.
4. A cutover is performed: the organization's connection routing is updated to use the new schema.
5. The old data in the shared schema is retained for 30 days, then purged.
6. The migration is fully audit-logged with before/after snapshots of row counts.

### RLS in Dedicated Schema

RLS policies remain active in dedicated schemas as a defense-in-depth layer. The `organization_id` column is retained in all tables, and the same `set_config` mechanism is used. This ensures that no behavioral change is required in application code after migration.

---

## Isolation Tier 3: Dedicated Database (Enterprise Tier)

### Description

The organization's data resides in a completely separate PostgreSQL database instance with dedicated compute, storage, and network resources. This tier provides full resource isolation and meets the strictest compliance requirements (HIPAA, FedRAMP, etc.).

### When to Migrate

Migration to Dedicated Database is triggered by:

- Enterprise tier subscription with a dedicated infrastructure requirement
- Regulatory requirement for physical data isolation
- Organization requires custom backup schedules, point-in-time recovery windows, or data residency in a specific region
- Organization size warrants dedicated compute for performance predictability

### Connection Pooling Strategy

Each dedicated database tenant has its own PgBouncer instance. The connection string for the tenant is stored in AWS Secrets Manager at `galaxy/db/{organizationId}` and is resolved at runtime by the `TenantContextMiddleware` when the organization is identified as a Tier 3 tenant.

The API layer and worker processes maintain a connection pool per active Tier 3 tenant, evicting idle connections after a configurable timeout to prevent resource exhaustion.

### Migration Path

1. Platform Admin provisions a new RDS instance in the organization's required region.
2. A full logical backup of the organization's data is taken from the shared database.
3. The backup is restored to the dedicated instance.
4. A brief dual-write period ensures no data loss during cutover.
5. The organization's routing entry in `organizations.db_tier` is updated to `dedicated`, and the Secrets Manager path is configured.
6. The old data is purged from the shared database after a 30-day retention window.

---

## Tenant Routing

### How `tenantId` Is Resolved Per Request

Tenant context resolution occurs in `TenantContextMiddleware` and follows a priority chain depending on the request path:

#### API Requests (JWT-authenticated)

1. The JWT is validated by `AuthMiddleware`.
2. The `tenantId` claim is extracted from the validated JWT payload.
3. `TenantContextMiddleware` looks up the organization by `tenantId` and verifies its status is `active`.
4. The RLS context is set: `SELECT set_config('app.current_tenant', tenantId, true)`.
5. If the organization is suspended or deleted, the request is rejected with 403.

#### WhatsApp Webhook Requests

1. The `x-hub-signature-256` header is verified against the HMAC-SHA256 of the raw request body using `WHATSAPP_APP_SECRET`. If verification fails, the request is rejected with 403 immediately — no tenant lookup occurs.
2. The `phone_number_id` field is extracted from the webhook payload.
3. `WebhookRoutingService` queries the `organizations` table for the organization with matching `waba_phone_number_id`.
4. If found, the organization becomes the tenant context for all downstream processing.
5. The BullMQ job enqueued for this webhook includes `organizationId` and `correlationId`.
6. The worker sets the RLS context at the start of job processing.

#### Cron / Scheduled Jobs

Scheduled jobs are seeded with an explicit `organizationId` in the job data at enqueue time. The worker always validates that the `organizationId` resolves to an active organization before proceeding.

#### Public Routes (No Tenant Context)

Only two routes bypass tenant context resolution:

- `GET /health` — infrastructure health check; no data access
- `GET /api/v1/webhooks/whatsapp` — Meta webhook verification challenge (no data access, only returns the challenge token)

---

## Tenant Context Strategy

### Setting the Context

The RLS context is set using a parameterized query — never via string interpolation:

```
SELECT set_config('app.current_tenant', $1, true)
```

The third parameter `true` means the setting is local to the current transaction. If the transaction is rolled back or the connection is returned to the pool, the setting is cleared automatically.

### Validation Before Every Query

`TenantContextMiddleware` (API layer) and every BullMQ worker processor must call the tenant context setter before any database operation. A shared `withTenantContext(db, organizationId, fn)` helper in `packages/utils` wraps this pattern, ensuring the setting is always applied and always cleared after the function returns.

### Context Leakage Prevention

PostgreSQL connection pooling via PgBouncer operates in **transaction-pooling mode** for Tier 1 (Shared RLS) deployments. In this mode, each transaction gets a fresh connection from the pool, and session-level settings (set with `true` for the third parameter of `set_config`) are scoped to the transaction. This prevents RLS context from persisting across unrelated transactions even if a connection is reused.

For Tier 3 (Dedicated Database), session-pooling mode is acceptable because each session is already isolated to a single tenant's database.

---

## Cross-Tenant Protection

### What Prevents Cross-Tenant Data Access

1. **RLS policies** — database-level enforcement; cannot be bypassed by application code
2. **JWT tenant claim validation** — the API only sets RLS context for the tenant in the validated JWT; the `tenantId` in the JWT is immutable after signing
3. **BullMQ job scoping** — every job includes an explicit `organizationId`; workers validate this before processing
4. **Event filtering** — consumers validate `tenantId` on every `GalaxyEvent` before processing
5. **RBAC scope enforcement** — `RbacEnforcementService` validates that the actor's role scope covers the requested resource's `organization_id`
6. **WhatsApp routing validation** — `phone_number_id` is validated against the organization's registered WABA number before any processing

### Audit Tripwires

The following conditions are treated as security anomalies and trigger immediate high-severity audit log entries and platform alerts:

| Condition                                                                                         | Detection Point             | Response                                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| JWT `tenantId` does not match the organization resolved from resource ID                          | `PermissionGuard`           | 403 + `auth` category audit log at `critical` severity                     |
| BullMQ job `organizationId` does not match the tenant derived from the job's resource IDs         | Worker processor            | Job fails non-retryable + `admin` category audit log                       |
| Query returns rows with `organization_id` not matching current RLS context (should be impossible) | Integration test assertion  | CI fails; schema migration blocked                                         |
| Platform Admin reads organization operational data without declared incident context              | API handler                 | Permitted but logged at `critical` severity with justification requirement |
| Agent tool call targets a resource outside the session's `organizationId` scope                   | `AutomationGovernanceGuard` | Blocked; `agent.action.blocked` event emitted; audit log written           |

### Cross-Tenant Isolation Test

A mandatory automated test runs before every schema migration and on every CI build. The test:

1. Creates two separate tenant organizations (Tenant A and Tenant B) in the test database
2. Inserts records into all tenant-scoped tables under Tenant A's context
3. Switches to Tenant B's RLS context
4. Asserts that zero rows are returned for any query against any tenant-scoped table
5. Attempts an explicit `UPDATE` on Tenant A's records from Tenant B's context and asserts zero rows affected
6. Tears down both tenants

This test must pass on every PR targeting `main` or `develop`. A failure blocks the merge.
