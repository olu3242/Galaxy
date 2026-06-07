# Phase 01: Foundation

## Objectives

Establish the technical foundation that all subsequent phases depend on. This phase produces no user-facing features. Its output is a production-grade monorepo skeleton, CI/CD pipeline, security governance baseline, and a working local development environment. No feature work begins until Foundation is complete and every item in the acceptance criteria is green.

---

## Deliverables

### 1. Monorepo Structure

- `pnpm` workspace with Turborepo orchestration configured
- Package topology: `apps/api`, `apps/web`, `apps/worker`, `packages/types`, `packages/config`, `packages/utils`
- Shared `tsconfig.base.json` with `strict: true` and no `any` types
- Shared ESLint configuration (`eslint.config.js`) with TypeScript rules enforced
- Shared Prettier configuration
- Barrel exports (`index.ts`) in each package
- Workspace-level scripts: `build`, `test`, `typecheck`, `lint`, `format`

### 2. TypeScript Build

- All packages compile cleanly with `pnpm build` and zero type errors
- `pnpm typecheck` passes across all packages
- Strict TypeScript mode enforced — `"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`
- Source maps generated for all builds
- Declaration files generated for all `packages/`

### 3. CI/CD Pipeline

- GitHub Actions workflow runs on every push to every branch
- CI pipeline stages: install → typecheck → lint → test → build
- PR merge to `develop` or `main` requires CI green
- Branch protection rules configured: `main` and `develop` require PR + CI + at least 1 reviewer approval
- gitleaks secret scanning runs on every CI run and blocks on detection
- CodeQL analysis runs on PRs to `main` and `develop`
- `pnpm audit --prod` runs and blocks on high/critical CVEs

### 4. Security Governance Baseline

- All architecture documents in `architecture/` created and reviewed
- All security documents in `security/` created and reviewed
- ADRs 001–005 documented and accepted
- `docs/security/SECURITY.md` — responsible disclosure policy
- `docs/security/THREAT_MODEL.md` — initial threat model
- `docs/security/SECRETS_MANAGEMENT.md` — secrets management policy

### 5. Environment Configuration

- `.env.example` documenting all required environment variables
- `packages/config` — typed environment variable loader with validation (using `zod`)
- Local development environment: PostgreSQL + Redis via `docker compose -f infrastructure/docker/docker-compose.dev.yml up -d`
- Database migration runner configured: `pnpm --filter @galaxy/api db:migrate`
- Database seeder configured: `pnpm --filter @galaxy/api db:seed`

### 6. Shared Types Package

- `packages/types/src/events.ts` — `GalaxyEvent` envelope type with all required fields
- `packages/types/src/domains/` — placeholder type files for each OS module
- `packages/utils/src/errors.ts` — error class hierarchy (`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, etc.)
- `packages/utils/src/tenant-context.ts` — `withTenantContext` helper
- All types exported via barrel `index.ts`

### 7. Infrastructure Scaffolding

- `infrastructure/docker/docker-compose.dev.yml` — PostgreSQL 15 + Redis 7 + pgAdmin
- `infrastructure/docker/docker-compose.test.yml` — isolated test database
- Initial database migration creating the `organizations` table and enabling `pgcrypto` extension
- Database migration framework configured (sequential numbered migrations)

---

## Dependencies

- GitHub repository with branch protection configured
- pnpm v8+ installed in CI and local environments
- Docker Desktop or equivalent for local infrastructure
- AWS account with Secrets Manager configured (for future phases; access patterns defined now)
- Node.js 20 LTS as the runtime target

---

## Acceptance Criteria

- [ ] `pnpm install` completes without errors from a fresh checkout
- [ ] `pnpm build` compiles all packages with zero TypeScript errors
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm test` runs (even with zero test cases) without framework errors
- [ ] CI pipeline passes on the `foundation/geos` branch
- [ ] `docker compose -f infrastructure/docker/docker-compose.dev.yml up -d` starts PostgreSQL and Redis successfully
- [ ] `pnpm --filter @galaxy/api db:migrate` runs the initial migration without errors
- [ ] `GalaxyEvent` type is defined in `packages/types` and imports successfully in all packages
- [ ] `withTenantContext` helper is exported from `packages/utils`
- [ ] All error classes are exported from `packages/utils`
- [ ] gitleaks scan passes (no secrets detected)
- [ ] CodeQL baseline analysis completes with zero high/critical findings
- [ ] `pnpm audit --prod` returns no high/critical CVEs
- [ ] Architecture governance documents (all 23) are complete and in the repository
- [ ] ADRs 001–005 are documented with status `Accepted`

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| TypeScript strict mode breaks third-party library types | Medium | Medium | Pin library versions; add `@types/*` for untyped libs; use `unknown` with narrowing where types are unavailable |
| CI pipeline secrets not configured correctly (GitHub Actions secrets) | Low | High | Document all required secrets in `CONTRIBUTING.md`; test CI with a test secret before relying on production secrets |
| Docker Compose version incompatibility across developer machines | Low | Low | Document minimum Docker Desktop version; provide fallback native installation instructions |
| gitleaks false positives blocking CI | Medium | Low | Configure `.gitleaks.toml` allowlist for known false positives; review on a case-by-case basis |
| Monorepo build cache invalidation issues with Turborepo | Low | Low | Configure Turborepo `outputs` correctly; clear turbo cache if stale |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| CI pipeline duration | Under 5 minutes for full `install + typecheck + lint + test + build` |
| TypeScript strict mode violations | Zero (0) |
| High/critical CVEs in production dependencies | Zero (0) |
| Security documentation coverage | All 23 architecture and governance documents present |
| Developer onboarding time | A new engineer can run the full local stack from a fresh checkout in under 30 minutes |
