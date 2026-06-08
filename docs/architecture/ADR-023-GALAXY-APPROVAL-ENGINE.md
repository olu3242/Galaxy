# ADR-023: Galaxy Approval Engine

**Status:** Accepted
**Date:** 2026-06-08

## Context

Approval workflows require sequential or parallel step resolution, SLA tracking, and escalation. The existing `approvals` schema from migration 014 provides the data model.

## Decision

The `ApprovalService` (in `@galaxy/workflow`) owns the approval lifecycle:

1. Sequential approvals advance `current_step_order` after each approval.
2. Any rejection immediately terminates the chain with `rejected` status.
3. SLA breach triggers escalation via the SLA monitoring worker.
4. All decisions are immutable records in `approval_decisions`.

Parallel approval is a future extension (requires a `parallel_group` column on `approval_steps`).

## Consequences

- Approval history is fully auditable and immutable.
- Escalation is automatic via the scheduled SLA worker.
- Delegation is modeled by changing the `approver_id` on a pending step.
