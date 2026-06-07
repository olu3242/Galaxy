# Galaxy Loop OS — Claude Code Instructions

## Project Overview

Galaxy is a **multi-tenant Organization Operating System** that runs on WhatsApp. Organizations submit workflows, approvals, and reports through WhatsApp; Galaxy governs, audits, and continuously improves every operation via the Loop Engine.

This is a **TypeScript monorepo** (pnpm workspaces + Turborepo) containing:

- `apps/api` — Fastify REST + WebSocket API
- `apps/web` — Next.js 14 web dashboard (Mission Control)
- `apps/worker` — BullMQ background workers
- `packages/types` — Shared TypeScript types (GalaxyEvent, domain interfaces)
- `packages/config` — Shared configuration loaders
- `packages/utils` — Shared utility functions

---

## Commands

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Format all packages
pnpm format

# Run API in development
pnpm --filter @galaxy/api dev

# Run web in development
pnpm --filter @galaxy/web dev

# Run workers in development
pnpm --filter @galaxy/worker dev

# Run local infrastructure (PostgreSQL, Redis)
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Run database migrations
pnpm --filter @galaxy/api db:migrate

# Seed development database
pnpm --filter @galaxy/api db:seed
```

---

## Architecture

### Request Lifecycle

```
WhatsApp / API / Cron
  → API Gateway (Fastify)
  → TenantContextMiddleware  ← resolves organizationId, sets RLS context
  → AuthMiddleware           ← validates JWT / WhatsApp phone identity
  → PermissionGuard          ← enforces RBAC policy
  → Job Queue (BullMQ)       ← ALL operations are async; never execute synchronously from webhook
  → Worker                   ← invokes OS module
  → Event Emitter            ← publishes GalaxyEvent to internal bus
  → Audit Logger             ← writes immutable audit_log entry
  → Response / Notification
```

### OS Modules

| Module           | Package path (planned)           | Status   |
| ---------------- | -------------------------------- | -------- |
| Identity OS      | `packages/modules/identity`      | Sprint 1 |
| People OS        | `packages/modules/people`        | Sprint 2 |
| Communication OS | `packages/modules/communication` | Sprint 1 |
| Workflow OS      | `packages/modules/workflow`      | Sprint 1 |
| Governance OS    | `packages/modules/governance`    | Sprint 2 |
| Knowledge OS     | `packages/modules/knowledge`     | V1       |
| Analytics OS     | `packages/modules/analytics`     | Sprint 3 |
| Agent OS         | `packages/modules/agents`        | V1       |
| Loop OS          | `packages/modules/loop`          | Sprint 2 |

---

## Critical Security Rules

### 1. NEVER use string interpolation in SQL queries

**Wrong — SQL injection vulnerability:**

```typescript
// ❌ NEVER DO THIS
await db.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
await db.query(`SELECT * FROM members WHERE id = '${memberId}'`);
```

**Correct — always use parameterized queries or the pg driver's options API:**

```typescript
// ✅ Parameterized
await db.query('SELECT * FROM members WHERE id = $1', [memberId]);

// ✅ For SET LOCAL, use pg's options or a helper
await db.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId]);
```

### 2. ALWAYS validate tenant context before database access

Every database query must run within an established tenant context. The `TenantContextMiddleware` is mandatory on all routes except `/health` and `/api/v1/webhooks/whatsapp` (which sets its own context after signature verification).

### 3. ALWAYS verify WhatsApp webhook signatures

```typescript
// ✅ Required — validate Meta's HMAC-SHA256 signature before processing
const signature = request.headers['x-hub-signature-256'];
const expected = crypto
  .createHmac('sha256', env.WHATSAPP_APP_SECRET)
  .update(request.rawBody)
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expected}`))) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

### 4. NEVER log sensitive fields

PII, tokens, secrets, and WhatsApp message content must never appear in application logs. Use structured logging with field redaction. Redact: `phone`, `whatsapp_phone`, `token`, `secret`, `password`, `api_key`, `authorization`.

### 5. Audit log entries are IMMUTABLE

The `audit_logs` table has INSERT-only RLS. Never attempt UPDATE or DELETE on audit logs. The RLS policy enforces this at the database level, but application code must not attempt it.

### 6. Agent write actions require governance validation

Before any AI agent performs a write operation (create, update, delete, trigger), the `AutomationGovernanceGuard` must run. Agents cannot bypass the permission matrix.

---

## Database Conventions

- All tables include `organization_id UUID NOT NULL` for RLS filtering
- All PKs are UUID (`gen_random_uuid()`)
- All timestamps are `TIMESTAMPTZ DEFAULT NOW()`
- All JSONB columns default to `'{}'`
- Row-Level Security is enabled on every table (except `organizations`)
- Tenant context is set via: `SELECT set_config('app.current_tenant', $1, true)`
- Migrations live in `apps/api/src/db/migrations/` and are numbered sequentially
- Never write raw SQL in application code — use the query builder or typed helpers

---

## Event System

All state changes emit a `GalaxyEvent`. The event envelope is defined in `packages/types/src/events.ts`. Every event must include:

- `id` — UUID
- `version` — semver string (currently `"1.0"`)
- `type` — dot-separated string (e.g., `workflow.submitted`)
- `tenantId` — organization UUID
- `correlationId` — UUID tracing this request chain
- `causationId` — UUID of the parent event (if triggered by another event)
- `actor` — `{ type: 'member' | 'agent' | 'system', id: string }`

Never publish events without a `correlationId`. Generate one at the entry point and pass it through the entire call chain.

---

## Testing Requirements

- **Unit tests** — all pure functions in `packages/`; run with Vitest
- **Integration tests** — database operations; use a test database with RLS enabled
- **Cross-tenant isolation test** — MANDATORY before any schema migration ships; verify that tenant A cannot read tenant B's data under any query path
- **Webhook tests** — test signature validation; never skip the signature check in tests
- All tests run in CI; no PR merges without green tests

---

## Branch Strategy

- `main` — production-ready code; protected; requires PR + CI green
- `develop` — integration branch; all feature branches merge here first
- `sprint/<n>` — sprint integration branches
- `feat/<ticket>-<slug>` — feature work
- `fix/<ticket>-<slug>` — bug fixes
- `foundation/<slug>` — infrastructure/foundation work (current: `foundation/geos`)

Never push directly to `main` or `develop`.

---

## File Conventions

- TypeScript strict mode (`"strict": true`) everywhere
- No `any` types — use `unknown` and narrow, or define proper types
- No `// @ts-ignore` — fix the type issue
- Barrel exports via `index.ts` in each package
- Filenames: `kebab-case.ts` for modules, `PascalCase.ts` for classes
- Test files: `*.test.ts` co-located with source, or in `__tests__/`

---

## Environment Variables

All environment variables are documented in `.env.example`. Never commit `.env` files. Never hardcode secrets. In production, secrets are loaded from AWS Secrets Manager (see `docs/security/SECRETS_MANAGEMENT.md`).

Required variables for local development:

```
DATABASE_URL, REDIS_URL, JWT_SECRET,
WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
ANTHROPIC_API_KEY
```

---

## Key Documents

- Product Requirements: `docs/product/PRD.md`
- Technical Architecture: `docs/product/ARCHITECTURE.md`
- OS Module Reference: `docs/product/OS_STRUCTURE.md`
- Architecture Decisions: `docs/architecture/ADR-*.md`
- Security Policy: `docs/security/SECURITY.md`
- Threat Model: `docs/security/THREAT_MODEL.md`
- Secrets Management: `docs/security/SECRETS_MANAGEMENT.md`
- Roadmap: `ROADMAP.md`
- Sprint 0 Plan: `SPRINT_0.md`
