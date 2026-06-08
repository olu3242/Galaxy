# ADR-024: Galaxy Workflow Builder

**Status:** Accepted
**Date:** 2026-06-08

## Context

Organizations need to create and manage workflow definitions without engineering involvement. A visual builder must support the 5 flow types and 11 automation domains.

## Decision

The Workflow Builder is a Next.js page at `/workflow-os/builder` in `apps/web`. It writes to the `/api/v1/workflow-os/definitions` endpoint. Workflow definitions are stored as JSONB in the `workflows.definition` column.

Supported node types: Start, Task, Approval, Decision/Condition, Notification, AI Node, Wait, Escalation, End.

Versioning uses the existing `workflows.version` INT column. Activation (`is_active=true`) publishes a version for execution.

## Consequences

- Workflow definitions are schema-free JSON, enabling flexible node configurations.
- Version history requires querying `workflow_history` with the run correlation.
- Simulation (dry-run) is a future feature.
