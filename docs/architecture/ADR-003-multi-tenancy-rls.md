# ADR-003: Multi-Tenancy via PostgreSQL Row-Level Security

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Engineering Foundation
**Tags:** security, database, multi-tenancy, architecture

---

## Context

Galaxy is a multi-tenant SaaS platform. Every piece of data belongs to exactly one organization (tenant). The system must guarantee that tenant A can never read or write tenant B's data — under any query path, any code path, any bug in application logic.

This is the most security-critical architectural decision in the platform. A misconfiguration does not result in a single tenant's data leaking — it results in all tenants' data becoming accessible to each other simultaneously.

## Decision

We will use **PostgreSQL Row-Level Security (RLS)** as the primary tenant isolation mechanism for standard and growth tier tenants, with the tenant identifier propagated to PostgreSQL via `set_config()` at the start of every database transaction.

**Isolation tiers:**
- **Starter / Growth:** Shared database, shared schema, RLS enforced per row
- **Enterprise:** Dedicated schema per tenant within shared database
- **Government / Sovereign:** Dedicated database per tenant

## Rationale

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| Application-layer WHERE clauses | Simple, no DB config | Completely defeated by any missed WHERE clause; requires 100% developer discipline |
| Database-level RLS | Enforced at the database engine; cannot be bypassed by application bugs | Requires correct session variable setup on every connection; pooler compatibility requirements |
| Dedicated schema per tenant (all tiers) | Strong isolation | Expensive; schema proliferation; complex migration management |
| Dedicated database per tenant (all tiers) | Strongest isolation | Prohibitively expensive at starter/growth tier |

### Chosen Option: RLS with Parameterized Session Variable

RLS provides a defense-in-depth guarantee that application-layer WHERE clauses cannot provide. Even if a developer forgets a WHERE clause, the database engine enforces isolation. This is the correct choice for the standard tier.

## Consequences

### Positive
- Tenant isolation is enforced at the database engine — application bugs cannot bypass it
- Single schema simplifies migration management at standard/growth tier
- Upgrade path to dedicated schema/database is defined

### Negative / Trade-offs
- RLS adds query planning overhead (minimal, but measurable at very high volume)
- Connection poolers (PgBouncer) must use **transaction-mode pooling** — session-mode pooling would allow the tenant session variable to leak between connections
- `SECURITY DEFINER` functions bypass RLS — this pattern is PROHIBITED unless explicitly reviewed
- Superuser connections bypass RLS — migration scripts must not run with application credentials

## Implementation Notes

### CRITICAL: Use parameterized set_config, never string interpolation

```typescript
// ✅ CORRECT — parameterized
await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId]);

// ❌ WRONG — SQL injection risk — NEVER use this pattern
await db.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
```

The `true` third argument makes the setting transaction-local (resets on COMMIT/ROLLBACK), which is essential for connection pool safety.

### RLS Policy Pattern

Every table (except `organizations`) must have RLS enabled:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <table>
  USING (organization_id = current_setting('app.current_tenant', true)::UUID);
```

The `true` argument to `current_setting` prevents an error when the variable is not set (returns NULL instead), which is safe because no row's `organization_id` equals NULL.

### Mandatory Cross-Tenant Test

Before any schema migration ships, a cross-tenant isolation test MUST pass:

```typescript
// Pseudo-code — actual test in apps/api/src/db/__tests__/rls.test.ts
test('tenant A cannot read tenant B members', async () => {
  await setTenantContext(tenantAId);
  const members = await db.query('SELECT * FROM members');
  expect(members.rows.every(m => m.organization_id === tenantAId)).toBe(true);
});
```

### Connection Pooler Configuration

PgBouncer must be configured in `transaction` mode:
```ini
pool_mode = transaction
```

Session mode is PROHIBITED as it causes tenant context to leak across connections.

### Audit Logs Exception

The `audit_logs` table has a different RLS policy:

```sql
-- INSERT is allowed for all tenants; SELECT is restricted to own tenant
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (organization_id = current_setting('app.current_tenant', true)::UUID);
-- UPDATE and DELETE have no policies — they are implicitly denied
```

## Review Trigger

Revisit when:
- Any enterprise customer requires dedicated schema isolation
- Government customer requires dedicated database
- Query performance degrades and RLS overhead is identified as the cause
