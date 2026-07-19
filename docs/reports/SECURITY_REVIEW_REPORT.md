# Security Review Report

_Generated: 2026-06-09_

---

## Overview

This report reviews the security architecture of the Galaxy platform based on implemented code, CLAUDE.md security rules, and database design. It covers SQL injection prevention, tenant isolation, webhook verification, PII protection, audit immutability, and agent governance.

---

## 1. SQL Injection Prevention

**Rule:** Never use string interpolation in SQL queries. Use parameterized queries or `SELECT set_config()`.

**Implementation Status:**

The CLAUDE.md explicitly documents this rule with examples. The convention mandates:

```typescript
// Correct — parameterized
await db.query('SELECT * FROM members WHERE id = $1', [memberId]);

// Correct — for SET LOCAL
await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId]);
```

**Finding:** This must be verified at code review time for each route handler. The architectural standard is correct. Route handlers using `request.query` or `request.body` values in SQL are the primary risk surface. CI linting with `eslint-plugin-security` or `@typescript-eslint/no-unsafe-call` should be configured to catch violations.

**Risk Level:** Medium — Standard is defined; enforcement is manual.

---

## 2. Row-Level Security (RLS) and Tenant Isolation

**Rule:** Every database query must run within an established tenant context. The `TenantContextMiddleware` is mandatory on all routes except `/health` and `/api/v1/webhooks/whatsapp`.

**Implementation Status:**

- Every table except `organizations` has RLS enabled (confirmed via migration 008, 016, 029, 033, 036–037, 040–041, 044, 048).
- Tenant context is set via: `SELECT set_config('app.current_tenant', $1, true)`.
- All tables include `organization_id UUID NOT NULL` per database conventions.
- Sprint 1 through Phase 4 migrations follow this pattern consistently.

**Cross-Tenant Isolation Test:** CLAUDE.md mandates this test before any schema migration. Must verify tenant A cannot read tenant B's data under any query path. Recommend this be part of CI as a dedicated integration test suite.

**Finding:** Architecture is correct. Gap: `TenantContextMiddleware` is referenced in architecture docs but not visible in the current `apps/api/src/index.ts`. It must be registered before route handlers in the middleware chain.

**Risk Level:** High — If TenantContextMiddleware is not registered globally, RLS is the only safeguard against cross-tenant data leakage.

---

## 3. WhatsApp Webhook Signature Verification

**Rule:** Validate Meta's HMAC-SHA256 signature before processing any webhook payload.

**Required Pattern (from CLAUDE.md):**

```typescript
const signature = request.headers['x-hub-signature-256'];
const expected = crypto
  .createHmac('sha256', env.WHATSAPP_APP_SECRET)
  .update(request.rawBody)
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expected}`))) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

**Finding:** The webhook route `/api/v1/webhooks/whatsapp` is referenced in CLAUDE.md as the one route that bypasses TenantContextMiddleware (setting its own context after signature verification). This route was not found in the current route files — it is not yet implemented. This is a **production blocker** for WhatsApp integration.

**Risk Level:** Critical — WhatsApp webhook route is not implemented. When added, signature verification must be the first operation.

---

## 4. PII and Sensitive Field Protection

**Rule:** PII, tokens, secrets, and WhatsApp message content must never appear in application logs.

**Redacted fields:** `phone`, `whatsapp_phone`, `token`, `secret`, `password`, `api_key`, `authorization`.

**Implementation Status:**

Fastify logger is configured in `apps/api/src/index.ts` with:

```typescript
logger: {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'body.password', 'body.token', 'body.secret'],
},
```

**Finding:** The redact list covers `authorization`, `password`, `token`, `secret` but is missing:

- `body.phone`
- `body.whatsapp_phone`
- `body.api_key`
- `req.body.phone` (nested request body)

**Risk Level:** Medium — Partial redaction. Phone numbers could appear in logs.

**Recommendation:** Expand the redact array:

```typescript
redact: [
  'req.headers.authorization',
  'body.password',
  'body.token',
  'body.secret',
  'body.phone',
  'body.whatsapp_phone',
  'body.api_key',
],
```

---

## 5. Audit Log Immutability

**Rule:** The `audit_logs` table has INSERT-only RLS. Never attempt UPDATE or DELETE on audit logs.

**Implementation Status:**

Migration 007 creates the `audit_logs` table. Migration 008 enables RLS. The architectural constraint is that an INSERT-only RLS policy enforces immutability at the database level.

**Finding:** The RLS policy enforcing INSERT-only on `audit_logs` should be confirmed in migration 008. If the policy only enables RLS without defining an INSERT-only policy, the database-level protection is incomplete.

**Risk Level:** Medium — Must confirm INSERT-only policy exists in migration 008.

---

## 6. Agent Governance

**Rule:** Before any AI agent performs a write operation, the `AutomationGovernanceGuard` must run. Agents cannot bypass the permission matrix.

**Implementation Status:**

The `@galaxy/governance` module provides compliance checks and policy enforcement. The `@galaxy/policy-engine` module adds enforcement rules. The `@galaxy/agents` module's `governance/` subdirectory contains agent-specific governance logic.

**Finding:** The `AutomationGovernanceGuard` is architecturally referenced but its integration point in the agent execution path should be verified. The `processors/agent-execution.ts` worker file is the enforcement point.

**Risk Level:** Medium — Pattern is defined; runtime enforcement requires code review of agent-execution processor.

---

## 7. JWT Authentication

**Finding:** `@fastify/jwt` is declared as a dependency in `apps/api/package.json` but is not registered in `apps/api/src/index.ts`. This means JWT authentication is not currently enforced at the framework level on API routes.

**Risk Level:** Critical — No JWT authentication middleware is registered. All routes are currently unauthenticated.

**Recommendation:** Register `@fastify/jwt` in `buildApp()` before routes and add a `preHandler` hook or `onRequest` hook for authentication.

---

## 8. Rate Limiting

**Finding:** `@fastify/rate-limit` is declared as a dependency but not registered in `apps/api/src/index.ts`.

**Risk Level:** High — No rate limiting protection against brute force or abuse.

---

## 9. CORS and Security Headers

**Finding:** `@fastify/cors` and `@fastify/helmet` are declared but not registered.

**Risk Level:** High — Missing CORS policy and security headers (CSP, HSTS, X-Frame-Options, etc.).

---

## Summary Table

| Security Control           | Status                  | Risk Level |
| -------------------------- | ----------------------- | ---------- |
| SQL parameterized queries  | Standard defined        | Medium     |
| RLS tenant isolation       | Architecture OK         | High       |
| TenantContextMiddleware    | Not visible in index.ts | High       |
| WhatsApp webhook signature | Not implemented         | Critical   |
| PII log redaction          | Partial                 | Medium     |
| Audit log immutability     | Architecture OK         | Medium     |
| Agent governance guard     | Architecture OK         | Medium     |
| JWT authentication         | Not registered          | Critical   |
| Rate limiting              | Not registered          | High       |
| CORS / Security headers    | Not registered          | High       |

---

## Recommendations for Production Readiness

1. Register `@fastify/jwt`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit` in `buildApp()`
2. Implement the WhatsApp webhook route with HMAC-SHA256 signature verification
3. Expand the Fastify logger redact list to include `phone`, `whatsapp_phone`, `api_key`
4. Confirm INSERT-only RLS policy on `audit_logs` in migration 008
5. Register `TenantContextMiddleware` globally in `buildApp()`
6. Add cross-tenant isolation integration tests to CI
