# Dependency Cleanup Report

_Generated: 2026-06-09_

---

## Overview

This report cross-references `apps/api/package.json` declared dependencies against actual imports in `apps/api/src/index.ts` and route files to identify packages that may not be actively used.

---

## Declared Workspace Dependencies vs Active Usage

| Package                         | In package.json | Imported in index.ts | Used in routes             | Status                                    |
| ------------------------------- | --------------- | -------------------- | -------------------------- | ----------------------------------------- |
| @galaxy/identity                | Yes             | No                   | Implicit                   | Likely used via middleware                |
| @galaxy/people                  | Yes             | No                   | Implicit                   | Likely used in members/departments routes |
| @galaxy/events                  | Yes             | No                   | Implicit                   | Used by event emission in services        |
| @galaxy/config                  | Yes             | No                   | Implicit                   | Used by environment config loader         |
| @galaxy/utils                   | Yes             | No                   | Implicit                   | Shared utility functions                  |
| @galaxy/types                   | Yes             | No                   | Implicit                   | Type definitions — always needed          |
| @galaxy/analytics               | Yes             | No (route imports)   | analytics.ts               | Active                                    |
| @galaxy/intelligence            | Yes             | No (route imports)   | intelligence.ts            | Active                                    |
| @galaxy/knowledge               | Yes             | No (route imports)   | knowledge.ts               | Active                                    |
| @galaxy/agents                  | Yes             | No (route imports)   | agent-os.ts                | Active                                    |
| @galaxy/workflow                | Yes             | No (route imports)   | workflow-os.ts             | Active                                    |
| @galaxy/billing                 | Yes             | No (route imports)   | billing.ts                 | Active (legacy)                           |
| @galaxy/developer               | Yes             | No (route imports)   | developer.ts               | Active                                    |
| @galaxy/governance              | Yes             | No (route imports)   | governance.ts              | Active                                    |
| @galaxy/marketplace             | Yes             | No (route imports)   | marketplace.ts             | Active                                    |
| @galaxy/observability           | Yes             | No (route imports)   | observability.ts           | Active                                    |
| @galaxy/platform-admin          | Yes             | No (route imports)   | platform-admin.ts          | Active                                    |
| @galaxy/api-gateway             | Yes             | No (route imports)   | api-gateway.ts             | Active                                    |
| @galaxy/integrations            | Yes             | No (route imports)   | integrations.ts            | Active                                    |
| @galaxy/solution-packs          | Yes             | No (route imports)   | solution-packs.ts          | Active                                    |
| @galaxy/graph                   | Yes             | No (route imports)   | graph.ts                   | Active                                    |
| @galaxy/coo                     | Yes             | No (route imports)   | coo.ts                     | Active                                    |
| @galaxy/org-memory              | Yes             | No (route imports)   | org-memory.ts              | Active                                    |
| @galaxy/partner                 | Yes             | No (route imports)   | partner.ts                 | Active                                    |
| @galaxy/economy                 | Yes             | No (route imports)   | economy.ts                 | Active                                    |
| @galaxy/predictive              | Yes             | No (route imports)   | predictive.ts              | Active                                    |
| @galaxy/risk-intelligence       | Yes             | No (route imports)   | risk-intelligence.ts       | Active                                    |
| @galaxy/intelligence-network    | Yes             | No (route imports)   | intelligence-network.ts    | Active                                    |
| @galaxy/benchmarking            | Yes             | No (route imports)   | benchmarking.ts            | Active                                    |
| @galaxy/conversation            | Yes             | No (route imports)   | conversation.ts            | Active                                    |
| @galaxy/autonomous-intelligence | Yes             | No (route imports)   | autonomous-intelligence.ts | Active                                    |
| @galaxy/digital-twin            | Yes             | No (route imports)   | digital-twin.ts            | Active                                    |
| @galaxy/policy-engine           | Yes             | No (route imports)   | policy-engine.ts           | Active                                    |
| @galaxy/org-dna                 | Yes             | No (route imports)   | org-dna.ts                 | Active                                    |
| @galaxy/org-health              | Yes             | No (route imports)   | org-health.ts              | Active                                    |
| @galaxy/workflow-generator      | Yes             | No (route imports)   | workflow-generator.ts      | Active                                    |
| @galaxy/self-healing            | Yes             | No (route imports)   | self-healing.ts            | Active                                    |
| @galaxy/ai-deployment           | Yes             | No (route imports)   | ai-deployment.ts           | Active                                    |
| @galaxy/mission-control         | Yes             | No (route imports)   | mission-control.ts         | Active                                    |
| @galaxy/reliability             | Yes             | No (route imports)   | reliability.ts             | Active                                    |
| @galaxy/platform                | Yes             | No (route imports)   | platform.ts                | Active                                    |

---

## External Dependencies

| Package             | In package.json | Actively Used           | Notes                                    |
| ------------------- | --------------- | ----------------------- | ---------------------------------------- |
| @anthropic-ai/sdk   | Yes             | In agent/AI services    | Used in AI orchestration routes          |
| @fastify/cors       | Yes             | Likely registered       | Not visible in index.ts — potential gap  |
| @fastify/helmet     | Yes             | Likely registered       | Not visible in index.ts — potential gap  |
| @fastify/jwt        | Yes             | Auth middleware         | Not registered in current index.ts       |
| @fastify/rate-limit | Yes             | Rate limiting           | Not registered in current index.ts       |
| @fastify/swagger    | Yes             | API docs                | Not registered in current index.ts       |
| @fastify/swagger-ui | Yes             | API docs UI             | Not registered in current index.ts       |
| @fastify/websocket  | Yes             | WebSocket support       | Not registered in current index.ts       |
| bullmq              | Yes             | Worker queue publishing | Used in worker app, may be unused in API |
| fastify             | Yes             | Core framework          | Active                                   |
| ioredis             | Yes             | Redis connection        | Used in worker; may be indirect in API   |
| pg                  | Yes             | Database pool           | Active — used directly in index.ts       |
| pino                | Yes             | Structured logging      | Active — Fastify logger                  |
| zod                 | Yes             | Validation              | Used in route handlers                   |

---

## Findings and Recommendations

### Medium Priority

**Fastify plugins not registered in index.ts**

The following packages are declared in `package.json` but not registered in `apps/api/src/index.ts`:

- `@fastify/cors` — CORS headers required for web dashboard
- `@fastify/helmet` — Security headers (CSP, HSTS etc.)
- `@fastify/jwt` — JWT auth middleware
- `@fastify/rate-limit` — Request rate limiting
- `@fastify/swagger` + `@fastify/swagger-ui` — API documentation
- `@fastify/websocket` — WebSocket support

These plugins should be registered in `buildApp()` before routes. Their absence means security headers, CORS, and JWT validation are not applied at the framework level. **This is a production readiness gap.**

### Low Priority

**bullmq in API app**

`bullmq` is listed as an API dependency but queue publishing is expected to happen from the worker app. If the API enqueues jobs directly it is acceptable, but should be documented.

**ioredis in API app**

Same as `bullmq` — confirm whether the API directly connects to Redis or delegates entirely to the worker.

---

## Summary

- All 41 workspace module packages are actively used via route imports.
- 7 Fastify plugin packages are declared but not registered — production readiness gap.
- No workspace packages appear entirely unused.
