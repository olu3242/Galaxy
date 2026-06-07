# Sprint 0 — Foundation

**Sprint:** 0
**Duration:** 2 weeks (Weeks 1–2)
**Goal:** Zero to production-grade repository structure
**Branch:** `foundation/geos`

---

## Objective

Transform the Galaxy repository from a documentation-only archive into an implementation-ready platform with:
- A working monorepo structure
- Enforced code quality and security gates
- CI/CD pipeline
- Architecture and security governance
- Clear engineering process

No product features are built in Sprint 0. The output is a foundation that every subsequent sprint builds on.

---

## Deliverables

### 1. Monorepo Foundation
- [x] `package.json` — root workspace config with Turborepo scripts
- [x] `pnpm-workspace.yaml` — workspace package definitions
- [x] `turbo.json` — task graph (build, test, typecheck, lint)
- [x] `tsconfig.base.json` — strict TypeScript base config
- [x] `eslint.config.js` — ESLint flat config (strict TypeScript rules)
- [x] `.prettierrc` — code formatting config
- [x] `.gitignore` — comprehensive ignore rules (never commits .env)
- [x] `.env.example` — all environment variables documented

### 2. Application Scaffolds
- [x] `apps/api/` — Fastify API scaffold (package.json + tsconfig)
- [x] `apps/web/` — Next.js 14 scaffold (package.json + tsconfig)
- [x] `apps/worker/` — BullMQ worker scaffold (package.json + tsconfig)

### 3. Shared Packages
- [x] `packages/types/` — GalaxyEvent envelope, domain interfaces
- [x] `packages/config/` — Zod-validated environment config loader
- [x] `packages/utils/` — Event factory, ID generation utilities

### 4. CI/CD Pipeline
- [x] `.github/workflows/ci.yml` — TypeScript, lint, unit tests, integration tests, build, secret scan
- [x] `.github/workflows/security.yml` — Weekly CodeQL, dependency audit, secret scan

### 5. Architecture Governance
- [x] `docs/architecture/ADR-000-template.md` — ADR template
- [x] `docs/architecture/ADR-001-monorepo-turborepo.md`
- [x] `docs/architecture/ADR-002-event-driven-architecture.md`
- [x] `docs/architecture/ADR-003-multi-tenancy-rls.md` (fixes SQL injection in middleware)
- [x] `docs/architecture/ADR-004-whatsapp-cloud-api.md`
- [x] `docs/architecture/ADR-005-ai-agent-runtime.md`

### 6. Security Governance
- [x] `docs/security/SECURITY.md` — security policy, controls, GDPR
- [x] `docs/security/THREAT_MODEL.md` — STRIDE threat model
- [x] `docs/security/SECRETS_MANAGEMENT.md` — secrets storage and rotation

### 7. Engineering Process
- [x] `docs/engineering/CONTRIBUTING.md` — developer setup + standards
- [x] `docs/engineering/BRANCH_STRATEGY.md` — branching model
- [x] `docs/engineering/CODE_REVIEW.md` — review checklist + guidelines
- [x] `.github/PULL_REQUEST_TEMPLATE.md` — PR template with security checklist
- [x] `.github/ISSUE_TEMPLATE/bug_report.md`
- [x] `.github/ISSUE_TEMPLATE/feature_request.md`
- [x] `.github/CODEOWNERS`

### 8. Claude Operating System
- [x] `CLAUDE.md` — AI assistant instructions (commands, conventions, security rules)

### 9. Infrastructure
- [x] `infrastructure/docker/docker-compose.dev.yml` — PostgreSQL 16 + Redis 7
- [x] `infrastructure/docker/postgres/init.sql` — extension setup
- [x] `infrastructure/scripts/setup.sh` — one-command local setup

### 10. Product Documentation
- [x] `docs/product/README.md` — product docs index
- (Existing: PRD, ARCHITECTURE, OS_STRUCTURE, AUTOMATION_STRATEGY on PR branch)

### 11. Repository Documentation
- [x] `README.md` — project overview, quick start, structure
- [x] `ROADMAP.md` — phased delivery plan (Sprint 0 → V1 → Enterprise)

---

## Remaining Tasks (Before Sprint 1)

### Immediate (Day 1–2)
- [ ] Run `pnpm install` to generate `pnpm-lock.yaml`
- [ ] Set up Husky git hooks (`pnpm prepare`)
  ```bash
  pnpm exec husky init
  echo "pnpm lint-staged" > .husky/pre-commit
  echo "pnpm typecheck" > .husky/pre-push
  ```
- [ ] Merge PR #1 to bring product docs to `main`
- [ ] Merge `foundation/geos` to `develop` (create `develop` branch if not exists)

### Before Sprint 1 Kickoff
- [ ] Configure GitHub repository settings:
  - Enable branch protection on `main` and `develop`
  - Require CI to pass before merge
  - Require at least 1 approval
  - Require signed commits (optional but recommended)
- [ ] Add GitHub Actions Secrets (CI test credentials):
  - `JWT_SECRET` (test value)
  - `WHATSAPP_APP_SECRET` (test value)
- [ ] Verify CI pipeline runs green on `foundation/geos` branch
- [ ] Create `develop` branch
- [ ] Create Sprint 1 tracking issue

### Sprint 1 Prep
- [ ] Create `apps/api/src/` directory structure:
  ```
  apps/api/src/
  ├── index.ts           — Fastify app entry point
  ├── middleware/
  │   ├── tenant.ts      — TenantContextMiddleware
  │   ├── auth.ts        — JWT auth middleware
  │   └── permission.ts  — RBAC permission guard
  ├── db/
  │   ├── client.ts      — pg pool setup
  │   ├── migrate.ts     — migration runner
  │   └── migrations/    — numbered SQL migration files
  ├── routes/
  │   └── health.ts      — health check route
  └── modules/
      └── (OS modules go here in Sprint 1+)
  ```
- [ ] Create `apps/worker/src/` structure
- [ ] Create first database migration: `001_initial_schema.sql`

---

## Definition of Done

Sprint 0 is done when:
1. All checklist items above are checked
2. CI pipeline is green on the sprint branch
3. `pnpm install && pnpm build && pnpm test` completes without errors (after lockfile is generated)
4. `foundation/geos` PR is approved and merged to `develop`
5. `develop` branch exists and tracks `origin/develop`

---

## Key Decisions Made in Sprint 0

| Decision | ADR |
|---|---|
| pnpm workspaces + Turborepo | ADR-001 |
| BullMQ at MVP, Kafka at V1 | ADR-002 |
| PostgreSQL RLS for multi-tenancy | ADR-003 |
| Per-tenant WABA (Galaxy as BSP) | ADR-004 |
| Human-in-the-loop for agent Tier 3 actions | ADR-005 |

---

## Critical Issues Fixed in Sprint 0

| Issue | Resolution |
|---|---|
| SQL injection in TenantContextMiddleware (ARCHITECTURE.md sample) | ADR-003 documents the correct parameterized pattern; CLAUDE.md enforces it |
| No secrets management strategy | `docs/security/SECRETS_MANAGEMENT.md` defines the full strategy |
| No RLS cross-tenant isolation tests | Required as a CI gate in `ci.yml`; specified in ADR-003 |
| Misnamed empty directory `{docs,architecture,src,diagrams}/` | Excluded by `.gitignore` patterns; will be cleaned before Sprint 1 |
