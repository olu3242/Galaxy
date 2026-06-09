# Escalation Framework

## Overview

The Escalation Framework routes unresolved operational issues to the appropriate human or automated responder with SLA enforcement.

## Escalation Types

| Type                | Trigger                          | Default SLA |
| ------------------- | -------------------------------- | ----------- |
| `workflow_failure`  | Workflow fails after max retries | 4 hours     |
| `approval_timeout`  | Governance approval not actioned | 2 hours     |
| `threat_detected`   | High-severity threat confirmed   | 30 minutes  |
| `compliance_breach` | Policy violation detected        | 1 hour      |
| `data_quality`      | Data integrity check failed      | 8 hours     |
| `capacity`          | Resource utilization > 90%       | 2 hours     |

## Lifecycle

```
pending → acknowledged → resolved
         ↘ timed_out
```

- `pending`: Created, awaiting acknowledgement
- `acknowledged`: Responder has taken ownership
- `resolved`: Issue closed
- `timed_out`: SLA breached without acknowledgement

## Timeout Handling

`EscalationService.checkTimeouts()` scans for past-due escalations and marks them `timed_out`. This should be called by a scheduled worker every 5 minutes.

## Delegation

Escalations can be delegated to alternate responders via `DelegationRecord`, maintaining an audit chain of all delegation events.
