# ADR-001: Monorepo with pnpm Workspaces and Turborepo

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Engineering Foundation
**Tags:** infrastructure, tooling, build

---

## Context

Galaxy consists of multiple deployable units (API server, web dashboard, background workers) that share significant code: TypeScript types, configuration loaders, utility functions, and eventually domain modules. Without a structured approach, these shared concerns will be duplicated across services or managed via a complex internal package publishing workflow.

The team must choose between:
1. A single monorepo containing all applications and shared packages
2. Multiple separate repositories per service
3. A polyrepo with a shared private package registry

## Decision

We will use a **pnpm workspace monorepo** with **Turborepo** as the build orchestrator.

Structure:
```
apps/api       — Fastify API server
apps/web       — Next.js dashboard
apps/worker    — BullMQ workers
packages/types — Shared TypeScript types
packages/config — Shared config/env loaders
packages/utils  — Shared utilities
```

## Rationale

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| pnpm workspaces + Turborepo | Fast caching, parallel builds, single repo, easy cross-package changes | Requires monorepo CI discipline |
| npm workspaces + Nx | Feature-rich, code generation | Heavier, steeper learning curve |
| Separate repos | Full isolation, independent deploys | Duplicate config, painful cross-cutting changes, version drift on shared types |
| Yarn Bun workspaces | Modern, fast | Less ecosystem maturity for enterprise use |

### Chosen Option: pnpm + Turborepo

- pnpm's strict node_modules prevents phantom dependency issues
- Turborepo's remote caching dramatically speeds CI for unchanged packages
- Single repo means a single PR can span API + types + worker atomically
- TypeScript project references enforce correct build ordering

## Consequences

### Positive
- Type changes in `packages/types` break all consumers immediately — no version drift
- One `pnpm install` sets up the entire platform
- Turborepo cache means CI only rebuilds what changed

### Negative / Trade-offs
- All apps deploy from the same repo — deploy pipeline must filter by affected workspace
- Large git history as the project grows (mitigated by shallow clones in CI)

### Neutral
- Engineers must use pnpm, not npm or yarn, in this repository

## Implementation Notes

- Root `package.json` scripts delegate to `turbo run <task>`
- Each package defines its own `build`, `test`, `typecheck`, `lint` scripts
- `turbo.json` defines the task graph: `build` depends on `^build` (dependencies first)
- Internal packages reference each other as `workspace:*` — never use version numbers for internal packages
- `packages/*` are never published to npm; they are workspace-internal only

## Review Trigger

Revisit if the monorepo exceeds 50+ packages and build times degrade beyond 10 minutes on cold CI.
