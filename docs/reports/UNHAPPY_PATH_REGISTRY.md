# Unhappy Path Registry

## Overview

The Unhappy Path Registry catalogs known failure modes with severity classifications and automated recovery actions.

## Failure Categories

| #   | Category                  | Severity Range | Recovery Action                  |
| --- | ------------------------- | -------------- | -------------------------------- |
| 1   | `intent_parse_failure`    | low–medium     | Re-prompt with clarification     |
| 2   | `workflow_timeout`        | medium–high    | Auto-retry with backoff          |
| 3   | `approval_rejection`      | low–medium     | Notify requester, log reason     |
| 4   | `payment_failure`         | high–critical  | Retry + alert finance team       |
| 5   | `notification_failure`    | low–medium     | Fallback channel delivery        |
| 6   | `data_validation_error`   | medium         | Return error, request correction |
| 7   | `permission_denied`       | medium–high    | Log, notify admin                |
| 8   | `external_api_error`      | medium–high    | Retry with exponential backoff   |
| 9   | `tenant_isolation_breach` | critical       | Immediate block + alert          |
| 10  | `audit_log_failure`       | critical       | Halt operation, alert on-call    |
| 11  | `agent_action_rejected`   | medium         | Escalate to governance review    |
| 12  | `capacity_exceeded`       | high           | Queue request, notify ops        |

## Severity Map

| Severity   | SLA Response | Auto-Escalate   |
| ---------- | ------------ | --------------- |
| `low`      | 48 hours     | No              |
| `medium`   | 8 hours      | No              |
| `high`     | 2 hours      | Yes             |
| `critical` | 15 minutes   | Yes (immediate) |

## Classification Engine

`FailureClassificationEngine` auto-assigns severity and recovery rule based on registered failure patterns, reducing manual triage time.
