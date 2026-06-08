# ADR-027: Galaxy Workflow Object Model

**Status:** Accepted
**Date:** 2026-06-08

## Context

Define the canonical object model for GWOS and its relationships.

## Decision

Core objects and relationships:

```
Organization
  └── Workflow (definition, domain, flow_type)
        └── WorkflowRun (instance, status, SLA)
              ├── WorkflowRunStep (step execution state)
              ├── Approval (approval chain)
              │     └── ApprovalStep (individual decision)
              ├── Task (work item)
              └── WorkflowHistory (audit trail)

IntentDetection → WorkflowRun
ConversationSession → WorkflowRun
AiExecution → AiDecision → IntentDetection
```

Every object carries `organization_id` for RLS isolation, `correlation_id` for distributed tracing, and timestamps for audit.

## Classification Rule

A workflow definition MUST have:

- `automation_domain` — one of 11 operational domains
- `flow_type` — one of 5 canonical flow types
- `owner_id` — accountable owner
- Audit enabled (enforced by insert trigger, future)

## Consequences

- The object model is the foundation for cross-module analytics.
- All future Galaxy OS modules add workflow definitions to this model.
- No module may create state without a corresponding WorkflowRun.
