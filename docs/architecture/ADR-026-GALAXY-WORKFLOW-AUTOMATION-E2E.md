# ADR-026: Galaxy Workflow Automation End-to-End

**Status:** Accepted
**Date:** 2026-06-08

## Context

Document the end-to-end flow for the canonical use case: "Need approval for generator repair costing $2,500."

## Decision

The complete automated flow:

```
1.  WhatsApp message received
2.  API records inbound message (conversation_messages)
3.  POST /api/v1/workflow-os/detect-intent → intent='approval_request', domain='approval'
4.  API queries active workflows WHERE automation_domain='approval'
5.  POST /api/v1/workflow-os/instances → workflow_run created
6.  POST /api/v1/workflow-os/approvals → approval + steps created
7.  Notification sent to approver(s) via @galaxy/notifications
8.  SLA worker monitors due_at
9.  On approval: approval_decisions INSERT, workflow_run completed, knowledge captured
10. Analytics updated via @galaxy/analytics MetricsService
```

Steps 3–10 happen automatically without manual intervention.

## Consequences

- WhatsApp is the primary input channel, but the same flow works via API or web.
- Knowledge capture at step 9 requires integration with `@galaxy/knowledge` (future).
- Analytics at step 10 requires explicit metric recording after workflow completion.
