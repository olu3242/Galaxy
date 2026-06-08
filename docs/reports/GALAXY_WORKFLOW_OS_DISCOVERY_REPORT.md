# Galaxy Workflow OS — Discovery Report

Date: 2026-06-08

## Executive Summary

Galaxy Workflow OS (GWOS) is implemented on top of a solid foundation built in Sprints 1–3. This report documents what exists, what was built new, and the architectural decisions made.

## Existing Assets (Reused)

### Event System

- PostgreSQL-backed event store (`events` table from migration 006)
- EventPublisher with batch support and idempotency keys (`packages/events/src/publisher.ts`)
- EventSubscriber with InMemoryEventSubscriber (`packages/events/src/subscriber.ts`)
- EventRegistry with Zod schema validation (`packages/events/src/registry.ts`)

### Workflow Foundation

- `workflows` table with steps, conditions, runs, run_steps, history (migration 012)
- `tasks` table with assignments, dependencies, comments, history (migration 013)
- `approvals` table with steps, decisions, history (migration 014)
- `automations` table with execution tracking (migration 015)

### Domain Modules

- `@galaxy/analytics` — MetricsService, KPIService, DashboardService, ReportingService
- `@galaxy/knowledge` — document management, search, versioning, publishing
- `@galaxy/intelligence` — HealthScoreService, InsightService, RiskDetectionService, RecommendationService
- `@galaxy/communication` — channels, messaging, WhatsApp stub provider

### Infrastructure

- BullMQ worker skeleton (`apps/worker/`) ready for job processors
- `@galaxy/workflow` scaffold with empty directories for approvals/, automation/, services/, tasks/

## Gaps Addressed by GWOS

| Gap                                              | Resolution                                 |
| ------------------------------------------------ | ------------------------------------------ |
| workflows lacked domain/flow_type classification | Added via migration 025 (ALTER TABLE)      |
| No event consumer tracking or DLQ                | Added via migration 026                    |
| No AI execution audit trail                      | Added via migration 027                    |
| No WhatsApp conversation state                   | Added via migration 028                    |
| Workflow module was an empty scaffold            | Full implementation: 6 service classes     |
| Worker was an empty stub                         | Implemented 3 job processors + entry point |
| No GWOS API endpoints                            | 13 new REST routes in workflow-os.ts       |

## Architecture Decisions

See ADR-021 through ADR-027 in `docs/architecture/`.

## Risks

1. **WhatsApp Provider is a stub** — Real Meta API calls must be implemented before production.
2. **Intent detection uses rule-based matching** — AI-powered intent detection requires Anthropic API integration in the worker (implemented in processor but requires live key).
3. **Workflow step engine is simplified** — The multi-step progression engine (condition evaluation, branching) is partially implemented; complex flows need additional work.

## Non-Duplicated Systems

- Did NOT create a new event system — uses existing `@galaxy/events`
- Did NOT create new workflow tables — extended existing tables with ALTER TABLE
- Did NOT create a new notification system — routes to existing `@galaxy/notifications`
