# Galaxy Product Documentation

This directory contains the canonical product specification documents.

| Document | Description |
|---|---|
| [PRD.md](PRD.md) | Product Requirements Document — what Galaxy is, who it serves, feature requirements, MVP/V1/Enterprise scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical Architecture — full system design, stack decisions, database schema, API endpoints, deployment |
| [OS_STRUCTURE.md](OS_STRUCTURE.md) | Operating System Module Reference — detailed specification for all 9 OS modules |
| [AUTOMATION_STRATEGY.md](AUTOMATION_STRATEGY.md) | 4-Tier Automation Framework — trigger, conditional, agent, and Loop OS adaptive automation |

## Source of Truth

These documents represent the agreed product and architecture specification. Changes to these documents require:
1. Engineering + Product alignment
2. Any new architectural decisions captured in `docs/architecture/ADR-*.md`
3. PR with appropriate review

## Architecture Decisions

Specific architectural decisions made *from* these documents are recorded in ADRs:

- [ADR-001](../architecture/ADR-001-monorepo-turborepo.md) — Monorepo + Turborepo
- [ADR-002](../architecture/ADR-002-event-driven-architecture.md) — Event-driven architecture
- [ADR-003](../architecture/ADR-003-multi-tenancy-rls.md) — Multi-tenancy via RLS
- [ADR-004](../architecture/ADR-004-whatsapp-cloud-api.md) — WhatsApp per-tenant WABA model
- [ADR-005](../architecture/ADR-005-ai-agent-runtime.md) — AI agent human-in-the-loop policy
