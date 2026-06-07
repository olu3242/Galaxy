# Contributing to Galaxy

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- Git

## Local Setup

```bash
git clone https://github.com/olu3242/Galaxy.git
cd Galaxy
pnpm install
cp .env.example .env
# Edit .env with local values
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
pnpm --filter @galaxy/api db:migrate
pnpm dev
```

## Development Workflow

### Branching

See `docs/engineering/BRANCH_STRATEGY.md` for the full strategy.

Quick reference:
- Branch from `develop` (not `main`)
- Name: `feat/<ticket>-<slug>` or `fix/<ticket>-<slug>`
- PR targets `develop`

### Making Changes

1. Create your branch from `develop`
2. Make changes — run tests locally before pushing
3. Ensure `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass
4. Open a PR — fill in the PR template completely
5. Address review comments; do not force-push after review starts
6. Squash merge after approval

### Commit Messages

Use conventional commits format:

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `security`
Scopes: `api`, `web`, `worker`, `types`, `config`, `utils`, `identity-os`, `workflow-os`, `loop-os`, etc.

Examples:
```
feat(workflow-os): add leave request workflow template
fix(api): use parameterized query in tenant context middleware
security(whatsapp): validate HMAC signature before webhook processing
test(rls): add cross-tenant isolation test for members table
```

## Code Standards

### TypeScript

- Strict mode — no exceptions
- No `any` types — use `unknown` with type guards or define proper interfaces
- No `// @ts-ignore` — fix the type
- Explicit return types on all exported functions
- Use type-only imports: `import type { Foo } from './foo'`

### Security (Non-Negotiable)

1. **No string interpolation in SQL** — always parameterized queries
2. **Always validate webhook signatures** — HMAC-SHA256 before any processing
3. **Never log PII** — redact `phone`, `token`, `secret`, `password`, `api_key`
4. **Never return secrets in API responses**
5. **Always set tenant context before DB queries**

Violation of security rules is grounds for immediate PR rejection regardless of other quality.

### Testing

- All new features require unit tests
- All database interactions require integration tests
- Any new table requires a cross-tenant RLS isolation test
- Target: 80% line coverage on `packages/`, 70% on `apps/`

### No Comments Policy

- Default: write no comments
- When to write a comment: the WHY is non-obvious (hidden constraint, workaround for a specific bug, invariant that would surprise a reader)
- Never write comments explaining WHAT the code does — well-named functions do that
- Never write comments that reference the task, fix, or PR

## Code Review

See `docs/engineering/CODE_REVIEW.md` for the review process.

## Questions?

Open a GitHub Discussion or reach out in the engineering channel.
