# Galaxy Agent Runtime Diagnostics

**Version:** 1.0  
**Owner:** Agent OS

---

## Purpose

This document defines the diagnostic capture requirements for the Agent OS runtime. Every agent execution must be fully observable: from assignment through reasoning, tool selection, memory update, checkpoint, retry, and completion.

No agent failure may produce only a generic error message.

---

## Mandatory Diagnostic Fields

Every agent execution must capture:

| Field                     | Source                                         | Required      |
| ------------------------- | ---------------------------------------------- | ------------- |
| `organizationId`          | Tenant context                                 | ✅            |
| `workspaceId`             | Department / team                              | If applicable |
| `actorId`                 | Triggering actor                               | ✅            |
| `agentId`                 | `autonomous_agents.id`                         | ✅            |
| `agentType`               | executive, hr, finance, …                      | ✅            |
| `workstreamId`            | Parent workstream                              | ✅            |
| `workflowRunId`           | Associated workflow run                        | If applicable |
| `channel`                 | Origin channel                                 | ✅            |
| `conversationId`          | Conversation context                           | If applicable |
| `dagNodeId`               | Workflow DAG node                              | If applicable |
| `memorySnapshot`          | org_memories at execution start                | If applicable |
| `knowledgeSources`        | document IDs retrieved                         | If applicable |
| `correlationId`           | Threads all events                             | ✅            |
| `requestId`               | Distributed trace                              | ✅            |
| `queueJobId`              | BullMQ job ID                                  | ✅            |
| `retryHistory`            | `[{ attempt, stage, errorCode, recoveredAt }]` | ✅            |
| `exceptionType`           | Error class name                               | If failed     |
| `recoveryStrategy`        | Action taken                                   | If failed     |
| `rootCauseClassification` | Structured category                            | If failed     |
| `runtimeDurationMs`       | Total agent wall-clock                         | ✅            |

---

## Agent Lifecycle Events

The following events are emitted for every agent execution (defined in `packages/types/src/events.ts`):

```
agent.created
    ↓
agent.started
    ↓
agent.reasoning.started
    ↓
agent.tool.selected  (per tool call)
    ↓
agent.tool.completed (per tool call)
    ↓
agent.memory.updated
    ↓
agent.policy.checked
    ↓
agent.checkpoint.saved
    ↓
agent.retry          (if retrying)
    ↓
agent.completed | agent.failed | agent.cancelled
```

Each event carries `{ agentId, workstreamId, correlationId, tenantId, timestamp, payload }`.

---

## Root Cause Classification

When an agent fails, the root cause must be classified into one of:

| Category                 | Description                                   |
| ------------------------ | --------------------------------------------- |
| `POLICY_DENIED`          | AutomationGovernanceGuard rejected the action |
| `TOOL_TIMEOUT`           | External tool call exceeded SLA               |
| `KNOWLEDGE_UNAVAILABLE`  | Required knowledge chunk not found            |
| `MEMORY_READ_FAILURE`    | org_memories query failed                     |
| `PLANNING_FAILED`        | DAG construction returned invalid graph       |
| `PERMISSION_DENIED`      | RBAC / ABAC check failed                      |
| `DEPENDENCY_UNAVAILABLE` | Critical dependency unreachable               |
| `QUOTA_EXCEEDED`         | Token or action quota hit                     |
| `MAX_RETRIES_EXCEEDED`   | Retry limit reached without recovery          |
| `UNKNOWN`                | Unclassified failure — requires investigation |

---

## Self-Healing Recovery Strategies

| Root Cause               | Automatic Recovery                                  |
| ------------------------ | --------------------------------------------------- |
| `TOOL_TIMEOUT`           | Retry up to 3x with exponential backoff             |
| `KNOWLEDGE_UNAVAILABLE`  | Retry with broader search; fallback to context-only |
| `MEMORY_READ_FAILURE`    | Proceed without memory; flag for async sync         |
| `PLANNING_FAILED`        | Re-plan with simplified DAG                         |
| `QUOTA_EXCEEDED`         | Pause; resume after quota reset window              |
| `DEPENDENCY_UNAVAILABLE` | Activate degraded mode; notify Mission Control      |
| `POLICY_DENIED`          | Halt; escalate to human operator; never retry       |
| `PERMISSION_DENIED`      | Halt; escalate; never retry                         |

---

## Governance Requirement

Before any agent performs a write operation (create, update, delete, trigger), the `AutomationGovernanceGuard` must run. This is enforced in application code. The diagnostic record must include the result of the governance check even when approved.

**No agent may bypass the permission matrix.** This is a hard platform constraint.

---

## Diagnostics in Mission Control

Agent diagnostics surface in Mission Control at:

```
GET /api/v1/admin/runtime/workstreams/:workstreamId
```

The `telemetry` array includes agent-stage entries with `agent_id` populated. Filter by `dependency = 'agent_os'` for agent-specific failures.
