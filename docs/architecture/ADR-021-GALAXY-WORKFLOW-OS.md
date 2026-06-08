# ADR-021: Galaxy Workflow OS as Canonical Execution Layer

**Status:** Accepted
**Date:** 2026-06-08

## Context

Galaxy needs a unified execution model for all organizational workflows across every OS module (HR, Finance, Membership, etc.). Without a canonical runtime, each module would build independent execution logic, leading to inconsistency and duplicated governance.

## Decision

Galaxy Workflow OS (GWOS) is the canonical execution engine for all Galaxy modules. Every operation that changes organizational state must flow through a workflow instance. External systems (n8n, Zapier) are treated as action adapters, not execution engines.

## Canonical Flow

```
Conversation → Event → Intent Detection → Workflow Discovery
→ Workflow Instance → Step Execution → Approval/Task/Automation
→ Knowledge Capture → Analytics → Closure
```

## Consequences

- All Galaxy modules must declare their operations as workflow definitions with an `automation_domain` and `flow_type`.
- No module may execute state-changing operations outside the workflow runtime.
- The workflow engine owns SLA tracking, escalation, and audit.
