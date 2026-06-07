# ADR-001: Tenant Isolation Strategy

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-07 |
| **Review Date** | Sprint 2 |
| **Deciders** | CTO, Platform Lead Engineer |
| **Related Documents** | `security/TENANT_ISOLATION.md`, `architecture/DATA_MODEL.md` |

---

## Context

Galaxy is a multi-tenant SaaS platform operating as a WhatsApp Business Solution Provider (BSP). Multiple independent organizations onboard to the platform and use it to run sensitive business processes including HR approvals, financial workflows, and compliance reporting.

Key context factors:

1. **Data sensitivity:** Each organization's operational data (member profiles, workflow content, approval decisions, messages) is highly sensitive and confidential. A cross-tenant data leak would be a critical security incident and likely a contractual/regulatory violation.

2. **WhatsApp BSP model:** Galaxy routes inbound WhatsApp messages from multiple organizations through a shared platform infrastructure. Correct tenant routing by `phone_number_id` is required before any data access.

3. **Multi-tenancy as a core property:** The platform is designed from the ground up for multi-tenancy. This is not a post-hoc consideration. All data models, events, and access patterns carry `organization_id` as a first-class field.

4. **Regulatory requirements:** GDPR (EU), and potential future requirements for HIPAA or ISO 27001 certification, require demonstrable data isolation controls.

5. **MVP resource constraints:** Building separate database infrastructure per tenant at launch is not economically viable. The team needs an isolation model that works at launch with a defined migration path as organizations grow.

6. **Defense in depth:** Relying solely on application-level filtering is insufficient. The isolation mechanism must be enforced at a layer below the application code.

---

## Decision

**We adopt a Row-Level Security (RLS) first approach with a defined migration path to dedicated schema (Growth tier) and dedicated database (Enterprise tier).**

### Tier 1 — Shared RLS (MVP)

All tenants share a single PostgreSQL database and schema. Every tenant-scoped table includes `organization_id UUID NOT NULL`. PostgreSQL RLS policies are defined on every tenant-scoped table using the pattern:

```sql
USING (organization_id = current_setting('app.current_tenant')::uuid)
```

The tenant context is set at the start of every request or worker job using a parameterized call (never string interpolation):

```
SELECT set_config('app.current_tenant', $1, true)
```

A mandatory cross-tenant isolation test runs in CI before every schema migration. The test creates two tenants, inserts data under Tenant A, switches to Tenant B's context, and asserts zero rows are returned for all tenant-scoped tables.

### Tier 2 — Dedicated Schema (Growth)

Organizations that reach volume thresholds or contractual requirements are migrated to a dedicated PostgreSQL schema (`tenant_{slug}`). RLS remains active as defense-in-depth. Migration is performed by a platform admin with a defined data migration playbook.

### Tier 3 — Dedicated Database (Enterprise)

Enterprise organizations with the strictest isolation requirements receive a dedicated PostgreSQL instance. Connection strings are stored in AWS Secrets Manager and resolved at runtime by `TenantContextMiddleware`.

---

## Consequences

### Positive

- **Immediate strong isolation:** RLS enforces isolation at the database level, below application code. A query bug that omits a `WHERE organization_id = ...` clause is still protected by the RLS policy.
- **Low operational overhead at MVP:** Single database deployment is simple to operate, monitor, and back up at launch.
- **Clear migration path:** Organizations can be graduated to higher isolation tiers without application code changes (only infrastructure and routing changes).
- **Compliance-ready:** RLS is a recognized isolation control for GDPR, SOC 2 Type II, and ISO 27001 purposes.
- **Developer ergonomics:** The `withTenantContext` helper in `packages/utils` makes correct context-setting the default — developers do not need to remember to add `WHERE organization_id = ?` to every query.

### Negative

- **Noisy neighbor risk:** High-volume tenants can impact query performance for other tenants in the shared database. Mitigation: connection pool limits per tenant, query timeouts, and analytics workloads routed to a read replica.
- **RLS misconfiguration risk:** A missing or incorrect RLS policy on a new table creates a cross-tenant data leak. Mitigation: mandatory cross-tenant isolation test in CI; policy on `public` schema default to deny.
- **Schema migration complexity:** All schema changes must maintain RLS invariants. Every migration PR must include the cross-tenant isolation test update.
- **Limited forensic cross-tenant querying:** Platform Admin cross-tenant queries require special handling and cannot use the standard RLS-scoped connection.

---

## Alternatives Considered

### Application-Level Filtering Only

**Approach:** Add `WHERE organization_id = $tenantId` to every query in application code. No RLS.

**Rejected because:** This provides no defense-in-depth. A single missed filter in a query — due to developer error, a new table that wasn't updated, or a query builder bug — causes a cross-tenant data leak. There is no database-level safety net. Given the sensitivity of the data and the multi-tenant nature of the platform, application-level filtering alone is considered insufficient.

### Separate Databases From Day 1

**Approach:** Each organization gets its own PostgreSQL database at onboarding. No shared infrastructure.

**Rejected because:** This is operationally prohibitive at MVP. Provisioning, managing, and monitoring dozens to hundreds of separate database instances during early growth would require significant DevOps investment and infrastructure cost that is not justified when the organization count is small. The migration path from Tier 1 to Tier 3 is defined for when this level of isolation is warranted.

### Schema Per Tenant From Day 1

**Approach:** Each tenant gets a dedicated schema at onboarding within the shared database.

**Rejected because:** This creates significant operational complexity from the first organization. Schema migrations must be applied to every tenant schema individually, which is complex to manage at scale and increases the risk of migration drift between tenants. RLS provides equivalent isolation at MVP with simpler operational characteristics.

---

## Review Notes

At Sprint 2, this decision will be reviewed to assess:
1. Whether any cross-tenant isolation test gaps have been identified
2. Whether query performance is impacting smaller tenants due to shared schema growth
3. Whether any organization has reached the Dedicated Schema migration criteria
