# ADR-025: Galaxy Runtime Execution Model

**Status:** Accepted
**Date:** 2026-06-08

## Context

How does GWOS execute workflow instances reliably at scale?

## Decision

Execution uses a two-layer model:

1. **Synchronous layer** — API creates a `workflow_runs` record, enqueues a BullMQ job, and returns the run ID to the caller (< 100ms).
2. **Async layer** — BullMQ worker processes execution jobs, advancing steps, calling external actions, and updating status.

Step execution is idempotent — each step has a unique `workflow_run_steps` record. Re-queuing a completed step is a no-op.

SLA monitoring runs as a scheduled BullMQ worker every 5 minutes. Intent detection runs as a BullMQ job triggered by inbound WhatsApp messages.

## Consequences

- All workflow operations are non-blocking from the API perspective.
- Step failures are retried via BullMQ's retry mechanism.
- Maximum reliability requires Redis persistence (`appendonly yes`).
