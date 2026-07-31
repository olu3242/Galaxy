# Galaxy Workstream Reliability Framework (WRF)

**Version:** 1.0  
**Status:** Active  
**Owner:** Platform Engineering

---

## Mission

Transform Galaxy into a self-healing AI Workstream Platform where every workstream — from a WhatsApp message to autonomous task completion — follows one standardised runtime contract.

Galaxy does not consider a workstream complete simply because a UI page loads or an HTTP 200 is returned.

**A workstream is only complete when it:**

1. Accepts an event
2. Identifies the tenant
3. Authenticates the actor
4. Understands intent
5. Selects the correct workflow
6. Coordinates AI agents
7. Executes every task
8. Recovers from failures
9. Produces auditable results
10. Learns from execution
11. Can be automatically certified

---

## The Workstream Runtime Contract

Every execution path in Galaxy — WhatsApp, web, API, scheduler, webhook, or integration — must conform to the `WorkstreamRuntime` interface defined in `packages/types/src/wrf.ts`.

```typescript
WorkstreamRuntime {
  workstreamId        // Unique execution ID
  organizationId      // Tenant scope (RLS key)
  workspaceId         // Optional sub-workspace
  actorId             // Authenticated actor
  channel             // whatsapp | web | api | scheduler | webhook | integration | internal
  intent              // Classified intent (leave_request, expense_request, …)
  workflowId          // Resolved workflow definition
  executionState      // queued | planning | running | waiting | completed | failed | degraded | paused | cancelled
  currentStage        // The 17-stage lifecycle position
  correlationId       // Threads all events, audit rows, and telemetry
  requestId           // Distributed trace ID
  agentIds            // Assigned AI agent IDs
  workflowGraph       // DAG node IDs in execution order
  retryCount          // Current retry attempt for active stage
  latencyMs           // Wall-clock ms from event_received to now
  dependencies        // Health status of all declared dependencies
  warnings            // Non-fatal warnings accumulated during execution
  errors              // Structured WorkstreamError records per failed stage
  health              // healthy | warning | degraded | unavailable
  lastCheckpoint      // Last durable checkpoint for crash recovery
  startedAt           // ISO timestamp
  completedAt         // ISO timestamp | null
}
```

No feature may implement its own runtime model. All processors must use `withWorkstreamRuntime` from `apps/worker/src/lib/withWorkstreamRuntime.ts`.

---

## The 17-Stage Lifecycle

Every workstream must execute stages in this order. No stage may be skipped for mandatory workstreams.

| Stage                     | Responsibility                                   | Retryable |
| ------------------------- | ------------------------------------------------ | --------- |
| `event_received`          | Accept and validate the inbound event            | No        |
| `identity_resolution`     | Resolve actor identity from JWT / WhatsApp phone | No        |
| `organization_resolution` | Resolve tenant from phoneNumberId or token       | No        |
| `workspace_resolution`    | Resolve department / team scope                  | No        |
| `permission_validation`   | RBAC + ABAC policy check                         | No        |
| `intent_detection`        | AI classification of message intent              | Yes (3x)  |
| `workflow_resolution`     | Match intent to workflow definition              | No        |
| `ai_planning`             | Agent OS planning phase (DAG construction)       | Yes (3x)  |
| `agent_assignment`        | Assign agents to DAG nodes                       | No        |
| `knowledge_retrieval`     | Fetch relevant knowledge chunks                  | Yes (3x)  |
| `task_execution`          | Execute the DAG                                  | Yes (3x)  |
| `state_synchronization`   | Persist state to DB and memory                   | No        |
| `notification_delivery`   | WhatsApp / push / email notifications            | Yes (3x)  |
| `audit_logging`           | Write immutable audit_log row                    | No        |
| `learning_engine`         | Extract insights for Loop OS                     | No        |
| `certification`           | Run WRF certification assertions                 | No        |
| `completed`               | Terminal success state                           | —         |

---

## Runtime Infrastructure

### Database Tables

| Table                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `workstream_checkpoints` | Durable execution snapshots for crash recovery |
| `workstream_telemetry`   | Per-stage timing and error records             |

Both tables have RLS + FORCE RLS enabled with `app.current_tenant` policies.

### Worker Integration

```typescript
// All BullMQ processors use the unified wrapper:
return withWorkstreamRuntime(job, pool, async (ctx) => {
  await ctx.advance('intent_detection');
  // processor logic using ctx.runtime
  await ctx.advance('workflow_resolution');
  // ...
});
```

### Checkpoint Recovery

On BullMQ retry, `withWorkstreamRuntime` automatically:

1. Looks up the last checkpoint by `correlationId`
2. Restores `WorkstreamRuntime` to the checkpointed stage
3. Skips already-completed stages
4. Increments `retryCount`

---

## Enterprise Error Standard

Generic failures are prohibited. Every error must be a `WorkstreamError`:

```typescript
WorkstreamError {
  stage           // Which WRF stage failed
  dependency      // Which dependency caused it
  errorCode       // Machine-readable code (KNOWLEDGE_RETRIEVAL_TIMEOUT)
  httpStatus      // HTTP equivalent (504)
  message         // Human-readable with context
  recoveryAction  // What the system is doing or what the operator should do
  retryable       // Whether automatic retry is safe
  occurredAt      // ISO timestamp
}
```

**Forbidden:**

- `"Failed."`
- `"Workflow failed."`
- `"Unable to complete request."`

**Required example:**

```
Customer Onboarding Workstream
Status: Knowledge Retrieval Failed
Stage: knowledge_retrieval
Dependency: knowledge_os
Error: KNOWLEDGE_RETRIEVAL_TIMEOUT
HTTP: 504
Correlation ID: 550e8400-e29b-41d4-a716-446655440000
Recovery: Retrying (attempt 2/3). Fallback Knowledge Cache Activated.
Next Retry: 15 seconds
```

---

## Self-Healing Recovery

The WRF automatically recovers retryable stage failures:

```
Knowledge Retrieval Timeout
    ↓
Retry 1 (same replica)
    ↓
Retry 2 (switch read replica)
    ↓
Retry 3 (fallback cache)
    ↓
Continue Workflow (degraded mode)
    ↓
Notify User (degraded mode banner)
    ↓
Schedule Background Sync
    ↓
Learning Engine records failure pattern
```

The workstream continues whenever it is safe to do so. Only non-retryable stages (identity, permission, audit) halt execution on failure.
