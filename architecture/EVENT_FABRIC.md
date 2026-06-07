# Galaxy Event Fabric

This document defines the event system standards, canonical event catalog, and operational policies for the Galaxy Loop OS event fabric.

---

## Event Standards

### Envelope Structure

Every event in Galaxy is a `GalaxyEvent`. The envelope is defined in `packages/types/src/events.ts` and must not be extended at the per-event level — domain-specific data belongs in `payload`.

```
GalaxyEvent {
  id            UUID          // Unique event ID (gen_random_uuid())
  version       string        // Semver string, currently "1.0"
  type          string        // Dot-notation: domain.entity.verb
  tenantId      UUID          // Organization ID — mandatory on all non-platform events
  correlationId UUID          // Request chain trace ID — generated at entry point
  causationId   UUID | null   // Parent event ID if triggered by another event
  actor         Actor         // { type: 'member' | 'agent' | 'system', id: string }
  occurredAt    TIMESTAMPTZ   // ISO 8601 UTC timestamp when the event occurred
  payload       object        // Domain-specific data (typed per event type)
  metadata      object        // Optional: source, region, tags — never PII
}
```

### Required Fields

All of the following fields are mandatory on every published event. A missing field is a hard error; the publisher must not emit the event.

| Field           | Requirement                                                                                |
| --------------- | ------------------------------------------------------------------------------------------ |
| `id`            | Must be a new UUID generated for each event instance                                       |
| `version`       | Must match the version of the event schema being published                                 |
| `type`          | Must match a registered event type string in the canonical catalog                         |
| `tenantId`      | Must be the UUID of the organization context; platform-scope events use `"platform"`       |
| `correlationId` | Must be propagated from the entry-point request; never generated mid-chain                 |
| `actor`         | Must accurately reflect whether the action was taken by a member, agent, or system process |
| `occurredAt`    | Must be the server-side UTC timestamp at the moment the state change was committed         |
| `payload`       | Must conform to the schema registered for the event `type` and `version`                   |

---

## Naming Convention

Events use a three-segment dot-notation: `domain.entity.verb`

- **domain** — the OS module that owns the event (lowercase: `identity`, `workflow`, etc.)
- **entity** — the primary aggregate or entity affected (lowercase, underscore-separated: `workflow_run`, `role_assignment`)
- **verb** — past-tense verb describing what happened (lowercase: `created`, `completed`, `failed`)

### Examples

| Event Type                       | Owner OS         | Meaning                                        |
| -------------------------------- | ---------------- | ---------------------------------------------- |
| `identity.organization.created`  | Identity OS      | A new organization was provisioned             |
| `identity.member.phone_linked`   | Identity OS      | A WhatsApp phone number was linked to a member |
| `workflow.run.started`           | Workflow OS      | A workflow run was initiated                   |
| `workflow.approval.granted`      | Workflow OS      | An approver granted an approval request        |
| `communication.message.received` | Communication OS | An inbound WhatsApp message was received       |
| `agent.action.executed`          | Agent OS         | An agent tool call completed successfully      |
| `governance.audit.recorded`      | Governance OS    | An audit log entry was written                 |
| `analytics.sla.breached`         | Analytics OS     | An SLA threshold was crossed                   |

### Anti-Patterns to Avoid

- **Present tense verbs**: `workflow.run.starts` — use past tense `workflow.run.started`
- **Ambiguous verbs**: `member.change` — be specific: `member.updated`, `member.deactivated`
- **Generic verbs**: `member.action` — always use a specific verb
- **Nested dots beyond three segments**: `workflow.run.step.completed` — flatten to `workflow.run.step_completed`

---

## Event Versioning Strategy

### Version Field Semantics

The `version` field is a semver string. The current version is `"1.0"`. The major version increments when the event schema introduces a breaking change; the minor version increments for additive, backwards-compatible changes.

| Change Type                   | Version Bump                | Backward Compatible |
| ----------------------------- | --------------------------- | ------------------- |
| Add optional field to payload | Minor (`1.0` → `1.1`)       | Yes                 |
| Rename required payload field | Major (`1.0` → `2.0`)       | No                  |
| Remove required payload field | Major                       | No                  |
| Change field data type        | Major                       | No                  |
| Add new optional event type   | None (new entry in catalog) | Yes                 |

### Dual-Publishing During Migration

When a breaking version is released for an event type, the publisher emits **both** the old version and the new version simultaneously for one full sprint transition period. Consumers must declare which version(s) they consume. After the transition window closes, the old version is removed from the publisher.

### Consumer Responsibility

Consumers must validate the `version` field before processing a payload. A consumer written for `version: "1.0"` must reject messages with `version: "2.0"` and route them to a dead letter queue for manual inspection.

---

## Correlation ID Strategy

### Origin

The `correlationId` is generated exactly once: at the request entry point. Entry points are:

- HTTP request received by the Fastify API gateway
- WhatsApp webhook payload received
- BullMQ scheduled job firing
- External webhook received

The entry point generates a UUID v4 and sets it on the request context. It must not be regenerated at any later point in the chain.

### Propagation

Every downstream operation within the same logical request chain must receive and forward the `correlationId`:

1. API handler sets `correlationId` on the request context object
2. When a BullMQ job is enqueued, `correlationId` is included in the job data payload
3. Workers extract `correlationId` from job data and pass it to all module service calls
4. All `GalaxyEvent` instances published within the chain use the same `correlationId`
5. All `audit_log` entries written within the chain include the `correlationId`

### Causation Chain

`causationId` is set to the `id` of the immediately preceding event that caused the current event. This allows reconstruction of full causal chains for debugging and forensics. If there is no preceding event (the action was directly initiated by a user or cron), `causationId` is `null`.

---

## Tenant Context in Events

### Mandatory Enforcement

Every `GalaxyEvent` must carry the `tenantId` of the organization in whose context the event occurred. No event may be published without a resolved `tenantId` unless it is an explicitly platform-scoped event (e.g., provisioning a new organization for the first time).

### Platform-Scoped Events

Platform-scoped events that occur before a tenant context exists use the string `"platform"` as the `tenantId`. These events are restricted to the Identity OS provisioning flow and are never accessible to tenant-level consumers.

### Tenant Isolation in Consumers

Event consumers must verify that the `tenantId` on an incoming event matches the tenant context in which the consumer is operating. Cross-tenant event processing is forbidden. Workers set the RLS tenant context via `set_config('app.current_tenant', tenantId, true)` before any database operation triggered by an event.

---

## Retry Strategy

### Exponential Backoff with Jitter

Failed event processing jobs are retried using an exponential backoff strategy with full jitter to prevent thundering herd.

| Attempt | Base Delay | Jitter Range | Max Delay      |
| ------- | ---------- | ------------ | -------------- |
| 1       | 1 second   | ±500ms       | —              |
| 2       | 2 seconds  | ±1s          | —              |
| 3       | 4 seconds  | ±2s          | —              |
| 4       | 8 seconds  | ±4s          | —              |
| 5       | 16 seconds | ±8s          | —              |
| 6       | 32 seconds | ±16s         | 60 seconds cap |

### Max Attempts

The default maximum retry count is **6 attempts**. After 6 failures the job is moved to the Dead Letter Queue. This limit may be overridden per job type; time-sensitive jobs (e.g., notification delivery) may use a lower limit of 3.

### Non-Retryable Errors

The following error classes are non-retryable and immediately move the job to the DLQ:

- `ValidationError` — the payload is structurally invalid; retrying will not help
- `ForbiddenError` — the action is blocked by a governance policy; retrying will not help
- `TenantContextError` — tenant context could not be resolved

---

## Dead Letter Strategy

### DLQ Naming Convention

Each BullMQ queue has a dedicated failed-jobs set. The naming convention is:

```
{queue-name}:failed
```

Example queues and their DLQs:

| Queue                   | DLQ                            |
| ----------------------- | ------------------------------ |
| `workflow-execution`    | `workflow-execution:failed`    |
| `notification-dispatch` | `notification-dispatch:failed` |
| `agent-session`         | `agent-session:failed`         |
| `audit-writer`          | `audit-writer:failed`          |

### Alerting

When a job lands in a DLQ, the following alerting actions are triggered:

1. A `governance.audit.recorded` event is emitted with category `admin` and severity `error`
2. A Slack/webhook alert is sent to the platform on-call channel (configured via `ALERT_WEBHOOK_URL`)
3. If the DLQ depth exceeds the configured threshold (default: 10 jobs) a `critical` severity alert fires

### Manual Replay

DLQ jobs may be replayed via:

1. The Platform Admin console (web UI): inspect job payload, correct if needed, re-enqueue
2. The admin CLI: `pnpm --filter @galaxy/worker dlq:replay --queue <name> --job-id <id>`
3. Bulk replay: `pnpm --filter @galaxy/worker dlq:replay-all --queue <name>` — use with caution

Every replay action is recorded as an `admin` category audit log entry with the platform admin's actor ID.

---

## Ownership Model

Each event type is owned by exactly one OS module. The owning module is the sole publisher of that event; other modules consume but never publish events they do not own.

| OS Module        | Owned Event Prefixes |
| ---------------- | -------------------- |
| Identity OS      | `identity.*`         |
| People OS        | `people.*`           |
| Communication OS | `communication.*`    |
| Workflow OS      | `workflow.*`         |
| Knowledge OS     | `knowledge.*`        |
| Governance OS    | `governance.*`       |
| Analytics OS     | `analytics.*`        |
| Agent OS         | `agent.*`            |

Cross-domain reactions are always implemented as consumer handlers in the reacting module, not by the source module publishing a foreign-domain event.

---

## Canonical Event Catalog

### organization.created

| Field           | Value                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| **Full type**   | `identity.organization.created`                                        |
| **Owner OS**    | Identity OS                                                            |
| **Description** | Emitted when a new tenant organization is provisioned on the platform. |

**Payload fields:**

| Field               | Type   | Description                                          |
| ------------------- | ------ | ---------------------------------------------------- |
| `organizationId`    | UUID   | The newly created organization's ID                  |
| `name`              | string | Organization display name                            |
| `slug`              | string | URL-safe organization identifier                     |
| `tier`              | string | Subscription tier: `starter`, `growth`, `enterprise` |
| `provisionedBy`     | string | Platform admin member ID who created the org         |
| `wabaPhoneNumberId` | string | WhatsApp Business Account phone number ID            |

---

### member.created

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| **Full type**   | `identity.member.created`                                            |
| **Owner OS**    | Identity OS                                                          |
| **Description** | Emitted when a new member account is created within an organization. |

**Payload fields:**

| Field            | Type     | Description                                    |
| ---------------- | -------- | ---------------------------------------------- |
| `memberId`       | UUID     | The new member's ID                            |
| `organizationId` | UUID     | Organization the member belongs to             |
| `roles`          | string[] | Initial role slugs assigned                    |
| `createdBy`      | UUID     | Member ID of the actor who created this member |
| `identityType`   | string   | `email`, `phone`, or `both`                    |

---

### member.updated

| Field           | Value                                                           |
| --------------- | --------------------------------------------------------------- |
| **Full type**   | `identity.member.updated`                                       |
| **Owner OS**    | Identity OS                                                     |
| **Description** | Emitted when a member's profile, roles, or identity is changed. |

**Payload fields:**

| Field            | Type     | Description                  |
| ---------------- | -------- | ---------------------------- |
| `memberId`       | UUID     | The member being updated     |
| `organizationId` | UUID     | Organization context         |
| `changedFields`  | string[] | Names of fields that changed |
| `updatedBy`      | UUID     | Actor who made the change    |

---

### department.created

| Field           | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| **Full type**   | `people.department.created`                                             |
| **Owner OS**    | People OS                                                               |
| **Description** | Emitted when a new department is added to the organizational hierarchy. |

**Payload fields:**

| Field                | Type         | Description                                 |
| -------------------- | ------------ | ------------------------------------------- |
| `departmentId`       | UUID         | New department ID                           |
| `organizationId`     | UUID         | Organization context                        |
| `name`               | string       | Department name                             |
| `headMemberId`       | UUID \| null | Member assigned as department head          |
| `parentDepartmentId` | UUID \| null | Parent department ID for nested hierarchies |
| `createdBy`          | UUID         | Actor who created the department            |

---

### workflow.started

| Field           | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| **Full type**   | `workflow.run.started`                                            |
| **Owner OS**    | Workflow OS                                                       |
| **Description** | Emitted when a workflow run is initiated from any trigger source. |

**Payload fields:**

| Field                  | Type   | Description                                    |
| ---------------------- | ------ | ---------------------------------------------- |
| `workflowRunId`        | UUID   | The new workflow run ID                        |
| `workflowDefinitionId` | UUID   | Definition being executed                      |
| `definitionVersion`    | string | Semver of the definition snapshot              |
| `organizationId`       | UUID   | Organization context                           |
| `initiatorMemberId`    | UUID   | Member who triggered the run                   |
| `triggerType`          | string | `whatsapp_message`, `api`, `schedule`, `agent` |
| `inputContext`         | object | Initial context data passed to the run         |

---

### workflow.completed

| Field           | Value                                                           |
| --------------- | --------------------------------------------------------------- |
| **Full type**   | `workflow.run.completed`                                        |
| **Owner OS**    | Workflow OS                                                     |
| **Description** | Emitted when a workflow run reaches its terminal success state. |

**Payload fields:**

| Field                  | Type        | Description                        |
| ---------------------- | ----------- | ---------------------------------- |
| `workflowRunId`        | UUID        | The completed workflow run ID      |
| `workflowDefinitionId` | UUID        | Definition that was executed       |
| `organizationId`       | UUID        | Organization context               |
| `completedAt`          | TIMESTAMPTZ | When the run completed             |
| `durationMs`           | number      | Total elapsed time in milliseconds |
| `outputContext`        | object      | Final context data after all steps |
| `stepCount`            | number      | Number of steps executed           |

---

### task.created

| Field           | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| **Full type**   | `workflow.task.created`                                    |
| **Owner OS**    | Workflow OS                                                |
| **Description** | Emitted when a task is created within a workflow run step. |

**Payload fields:**

| Field               | Type        | Description                 |
| ------------------- | ----------- | --------------------------- |
| `taskId`            | UUID        | New task ID                 |
| `workflowRunId`     | UUID        | Parent workflow run         |
| `workflowRunStepId` | UUID        | Step this task belongs to   |
| `organizationId`    | UUID        | Organization context        |
| `title`             | string      | Task title                  |
| `assigneeMemberId`  | UUID        | Member assigned to the task |
| `dueAt`             | TIMESTAMPTZ | Task deadline               |

---

### task.completed

| Field           | Value                                           |
| --------------- | ----------------------------------------------- |
| **Full type**   | `workflow.task.completed`                       |
| **Owner OS**    | Workflow OS                                     |
| **Description** | Emitted when a member marks a task as complete. |

**Payload fields:**

| Field            | Type        | Description                                      |
| ---------------- | ----------- | ------------------------------------------------ |
| `taskId`         | UUID        | Completed task ID                                |
| `workflowRunId`  | UUID        | Parent workflow run                              |
| `organizationId` | UUID        | Organization context                             |
| `completedBy`    | UUID        | Member who completed the task                    |
| `completedAt`    | TIMESTAMPTZ | Completion timestamp                             |
| `durationMs`     | number      | Time from creation to completion in milliseconds |

---

### approval.granted

| Field           | Value                                                |
| --------------- | ---------------------------------------------------- |
| **Full type**   | `workflow.approval.granted`                          |
| **Owner OS**    | Workflow OS                                          |
| **Description** | Emitted when an approver grants an approval request. |

**Payload fields:**

| Field               | Type           | Description                           |
| ------------------- | -------------- | ------------------------------------- |
| `approvalRequestId` | UUID           | The approval request that was granted |
| `workflowRunId`     | UUID           | Parent workflow run                   |
| `organizationId`    | UUID           | Organization context                  |
| `approvedBy`        | UUID           | Member who granted approval           |
| `approvedAt`        | TIMESTAMPTZ    | Approval timestamp                    |
| `reason`            | string \| null | Optional reason or comment            |

---

### approval.rejected

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Full type**   | `workflow.approval.rejected`                          |
| **Owner OS**    | Workflow OS                                           |
| **Description** | Emitted when an approver rejects an approval request. |

**Payload fields:**

| Field               | Type        | Description                            |
| ------------------- | ----------- | -------------------------------------- |
| `approvalRequestId` | UUID        | The approval request that was rejected |
| `workflowRunId`     | UUID        | Parent workflow run                    |
| `organizationId`    | UUID        | Organization context                   |
| `rejectedBy`        | UUID        | Member who rejected                    |
| `rejectedAt`        | TIMESTAMPTZ | Rejection timestamp                    |
| `reason`            | string      | Mandatory rejection reason             |

---

### message.received

| Field           | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| **Full type**   | `communication.message.received`                                              |
| **Owner OS**    | Communication OS                                                              |
| **Description** | Emitted when an inbound WhatsApp message is successfully received and routed. |

**Payload fields:**

| Field            | Type         | Description                                         |
| ---------------- | ------------ | --------------------------------------------------- |
| `messageId`      | UUID         | Internal message record ID                          |
| `wamid`          | string       | Meta-issued WhatsApp message ID                     |
| `conversationId` | UUID         | Conversation this message belongs to                |
| `organizationId` | UUID         | Organization context resolved by phone_number_id    |
| `senderMemberId` | UUID \| null | Member if phone is linked; null if unknown sender   |
| `phoneNumberId`  | string       | WABA phone_number_id that received the message      |
| `contentType`    | string       | `text`, `image`, `document`, `audio`, `interactive` |
| `receivedAt`     | TIMESTAMPTZ  | Timestamp from Meta webhook payload                 |

---

### message.sent

| Field           | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| **Full type**   | `communication.message.sent`                                                  |
| **Owner OS**    | Communication OS                                                              |
| **Description** | Emitted when an outbound WhatsApp message is successfully dispatched to Meta. |

**Payload fields:**

| Field               | Type           | Description                                       |
| ------------------- | -------------- | ------------------------------------------------- |
| `messageId`         | UUID           | Internal message record ID                        |
| `wamid`             | string         | Meta-issued WhatsApp message ID returned from API |
| `conversationId`    | UUID           | Conversation this message belongs to              |
| `organizationId`    | UUID           | Organization context                              |
| `recipientMemberId` | UUID           | Intended recipient member                         |
| `templateName`      | string \| null | Template name if a template message               |
| `sentAt`            | TIMESTAMPTZ    | Timestamp when Meta accepted the message          |

---

### notification.sent

| Field           | Value                                                            |
| --------------- | ---------------------------------------------------------------- |
| **Full type**   | `communication.notification.sent`                                |
| **Owner OS**    | Communication OS                                                 |
| **Description** | Emitted when a notification job successfully delivers a message. |

**Payload fields:**

| Field               | Type        | Description                                         |
| ------------------- | ----------- | --------------------------------------------------- |
| `notificationJobId` | UUID        | Notification job record ID                          |
| `organizationId`    | UUID        | Organization context                                |
| `recipientMemberId` | UUID        | Recipient member                                    |
| `channel`           | string      | `whatsapp` (expandable to `email`, `sms` in future) |
| `templateName`      | string      | Template used                                       |
| `sentAt`            | TIMESTAMPTZ | Delivery timestamp                                  |

---

### audit.recorded

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| **Full type**   | `governance.audit.recorded`                                                       |
| **Owner OS**    | Governance OS                                                                     |
| **Description** | Emitted after an audit log entry is successfully written to the audit_logs table. |

**Payload fields:**

| Field            | Type   | Description                                                 |
| ---------------- | ------ | ----------------------------------------------------------- |
| `auditLogId`     | UUID   | ID of the audit log entry                                   |
| `organizationId` | UUID   | Organization context                                        |
| `category`       | string | `auth`, `data`, `admin`, `agent`, `workflow`, `integration` |
| `eventType`      | string | The source event type that triggered this audit             |
| `actorId`        | string | Actor ID                                                    |
| `actorType`      | string | `member`, `agent`, `system`                                 |
| `resourceType`   | string | Entity type affected                                        |
| `resourceId`     | UUID   | Entity ID affected                                          |
| `severity`       | string | `info`, `warning`, `error`, `critical`                      |

---

### agent.action.executed

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| **Full type**   | `agent.action.executed`                                                           |
| **Owner OS**    | Agent OS                                                                          |
| **Description** | Emitted when an agent tool call completes successfully after governance approval. |

**Payload fields:**

| Field               | Type        | Description                         |
| ------------------- | ----------- | ----------------------------------- |
| `agentActionId`     | UUID        | Agent action record ID              |
| `agentSessionId`    | UUID        | Parent session                      |
| `organizationId`    | UUID        | Organization context                |
| `toolName`          | string      | Registered tool that was invoked    |
| `impactTier`        | number      | 1–4 impact classification           |
| `governanceOutcome` | string      | `auto_approved` or `human_approved` |
| `executedAt`        | TIMESTAMPTZ | Execution timestamp                 |
| `durationMs`        | number      | Tool execution duration             |
