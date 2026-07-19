# Recovery Framework

## Overview

The Recovery Framework handles automatic retry logic, fallback channel routing, and exhaustion escalation for failed operations.

## Components

### RecoveryEngine

- `initiateRetry`: Creates a `RetryRecord` using the applicable `RetryPolicy`
- `recordAttempt`: Logs each attempt with outcome and error detail
- `listRetries`: Queries retry records with optional status filter

## Retry Policies

Each policy is per `(organization_id, resource_type)`:

| Field               | Description                             |
| ------------------- | --------------------------------------- |
| `maxAttempts`       | Maximum retry count before exhaustion   |
| `backoffMs`         | Base backoff in milliseconds            |
| `backoffMultiplier` | Exponential multiplier per attempt      |
| `fallbackChannel`   | Alternate delivery method on exhaustion |

## Retry Status Lifecycle

```
pending → in_progress → succeeded
                      ↘ exhausted
```

## Fallback Channels

When `maxAttempts` is reached:

1. Switch to `fallbackChannel` if configured (e.g., email, SMS, webhook)
2. Create an escalation record via `EscalationService`
3. Notify assigned responders

## Exhaustion Logic

On exhaustion the retry record status becomes `exhausted` and an escalation of type `workflow_failure` is automatically raised.
