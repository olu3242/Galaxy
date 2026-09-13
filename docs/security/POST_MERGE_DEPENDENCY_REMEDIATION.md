# Post-Merge Dependency Remediation

## Trigger

The post-merge Security workflow on `main` failed `pnpm audit --audit-level=high` after PR #9 was merged at `b9e8887d64b1c7b7ccfeaee69a9dfa69c970a551`.

The audit reported 101 vulnerabilities: 8 critical, 51 high, 36 moderate, and 6 low.

## Remediation scope

This branch upgrades the directly exposed framework and test-runtime dependencies instead of suppressing the audit:

- Next.js: `14.2.0` -> `^15.5.24`
- Fastify: `^4.28.0` -> `^5.7.4`
- `@fastify/jwt`: `^8.0.0` -> `^10.2.2`
- Fastify plugins are moved to Fastify 5-compatible release lines.
- Vitest: `^2.0.0` -> `^3.2.6`
- PostCSS: moved to a patched release line.
- Targeted pnpm overrides cover vulnerable transitive `form-data`, `js-yaml`, `nanoid`, and `postcss` versions.
- `pnpm-lock.yaml` is regenerated from the remediated manifests.

## Certification contract

This remediation is not considered complete until the exact PR head passes:

1. `pnpm audit --audit-level=high`
2. Full-history secret scan
3. CodeQL
4. Unit tests
5. TypeScript
6. ESLint + Prettier
7. PostgreSQL migrations + RLS integration tests
8. Build
9. Playwright E2E

No audit suppression, severity downgrade, or production-readiness claim is permitted as a substitute for those gates.
