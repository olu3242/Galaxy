# ADR-002: Event Fabric Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-07 |
| **Review Date** | Sprint 3 |
| **Deciders** | CTO, Platform Lead Engineer |
| **Related Documents** | `architecture/EVENT_FABRIC.md`, `architecture/SYSTEM_ARCHITECTURE.md` |

---

## Context

Galaxy operates as an event-driven, asynchronous platform. The core design constraint is: **no operation is executed synchronously from a webhook handler**. Every state change must be processed asynchronously by a worker, and every state change must produce an immutable audit log entry.

Key context factors:

1. **WhatsApp webhook processing:** Meta delivers WhatsApp webhooks with tight response time requirements (must acknowledge within 20 seconds). All actual processing must be deferred to background workers.

2. **Audit trail requirement:** Every state change across all OS modules must be recorded in an immutable, tamper-evident audit log. This requires a reliable mechanism to ensure audit writes are never missed.

3. **Eventual consistency:** Galaxy's domain model accepts eventual consistency. A workflow step completing and the analytics metric being updated are not required to be atomic. The audit log must be consistent; analytics can lag.

4. **Correlation and causation tracing:** For debugging, forensics, and the Loop Engine, it must be possible to reconstruct the causal chain of any sequence of events using `correlationId` and `causationId`.

5. **MVP operational simplicity:** At launch, the team should be operating infrastructure they can understand and debug without specialized expertise. Kafka administration is a distinct operational skill set.

6. **V1 scale requirements:** By V1 (post-MVP), Galaxy expects event throughput that will exceed what a single Redis-backed BullMQ deployment can comfortably handle at high durability.

7. **Dead letter handling:** Failed event processing must be visible, alertable, and manually replayable without data loss.

---

## Decision

**We adopt BullMQ (Redis-backed) as the event queue and job orchestration layer at MVP, with a defined migration to Apache Kafka at V1. All events use the `GalaxyEvent` envelope standard regardless of the underlying transport.**

### MVP: BullMQ

BullMQ, backed by Redis, is the job queue for all asynchronous operations. Queues are defined per domain:
- `workflow-execution` — workflow run state machine advancement
- `notification-dispatch` — outbound WhatsApp message delivery
- `agent-session` — AI agent session execution
- `audit-writer` — audit log entry persistence
- `analytics-aggregation` — event stream aggregation into metric snapshots

Every job includes the `GalaxyEvent` envelope fields (including `correlationId`, `tenantId`, `actor`) as part of its job data. This ensures the full event context is available to workers without a separate event lookup.

The `audit-writer` queue has the highest priority and the most aggressive retry policy. Audit writes must not be lost.

### V1: Kafka Migration

At V1, the audit-writer, analytics-aggregation, and cross-module event fan-out are migrated to Apache Kafka topics. BullMQ remains for task-specific job queues (workflow execution, notification dispatch) where job-level retries, deduplication, and DLQ features are more natural.

The `GalaxyEvent` envelope standard remains unchanged. The migration affects only the transport; no consumer code changes are required if consumers use the `EventConsumer` abstraction from `packages/utils`.

### GalaxyEvent Envelope Standard

The `GalaxyEvent` type is defined in `packages/types/src/events.ts` and is the canonical envelope for all events on both transports. The required fields are defined in `architecture/EVENT_FABRIC.md`. The envelope must not be extended at the per-event level; domain payload belongs in the `payload` field.

---

## Consequences

### Positive

- **Operational simplicity at MVP:** BullMQ + Redis is well-understood, easy to deploy, and has excellent tooling. The team can operate it without Kafka expertise.
- **Built-in retry and DLQ:** BullMQ's retry and failed-job semantics map directly to Galaxy's retry and DLQ requirements.
- **Job-level semantics for workflows:** Task scheduling, priority queues, delayed jobs, and cron-based triggering are native BullMQ features, directly useful for workflow execution and escalation.
- **Transport abstraction:** The `GalaxyEvent` envelope and the `EventConsumer` abstraction mean the V1 Kafka migration is a transport-layer change, not a domain logic change.
- **Correlation tracing without infrastructure:** By embedding `correlationId` in job data, full request-chain tracing is available without deploying a dedicated distributed tracing system at MVP.

### Negative

- **Redis durability limitations:** Redis persistence (AOF or RDB) provides good-but-not-perfect durability. A Redis crash between a job being enqueued and AOF sync could lose a job. Mitigation: Redis AOF with `fsync=everysec` reduces this window to 1 second; audit writes have a separate confirmation step.
- **Eventual Kafka migration cost:** The V1 migration will require infrastructure provisioning, consumer rewrite for migrated queues, and operational tooling. This cost is accepted as a known future investment.
- **BullMQ does not support replay across consumers:** Unlike Kafka's consumer group offset model, BullMQ does not retain completed jobs for replay by multiple consumers. The `events` database table serves as the durable event store for replay and audit purposes.
- **Queue management overhead:** As the number of queues grows, monitoring queue depth across all queues requires dashboard tooling. This is addressed by the platform admin health dashboard.

---

## Alternatives Considered

### Direct Database Writes (Synchronous)

**Approach:** Instead of a job queue, write state changes directly to the database synchronously in the request handler.

**Rejected because:** This violates the core design constraint of not executing operations synchronously from webhook handlers. It also creates a tight coupling between the API layer and all downstream processing, reducing resilience. If the database is slow, webhooks time out. Direct writes also do not naturally produce the event stream needed for audit logging and analytics.

### Redis Streams

**Approach:** Use Redis Streams directly instead of BullMQ.

**Rejected because:** Redis Streams provides the event log semantics but lacks the job queue features (priority, delay, retry with backoff, DLQ) that are directly useful for workflow execution and notification dispatch. BullMQ builds on Redis Streams and adds exactly the features we need. Using BullMQ is using Redis Streams with a higher-level abstraction.

### AWS SQS + Lambda

**Approach:** Use AWS SQS as the message queue with Lambda functions as workers.

**Rejected because:** This would split the worker execution environment between containerized workers (for long-running agent sessions) and Lambda (for quick jobs), increasing operational complexity. It would also vendor-lock the worker layer to AWS. The team's current target infrastructure is container-based (ECS or equivalent), and BullMQ fits naturally within that model.

### Apache Kafka from Day 1

**Approach:** Deploy Kafka from the first sprint and use it as the sole event transport.

**Rejected because:** Kafka adds significant operational overhead: broker cluster management, partition design, consumer group coordination, offset management, and schema registry. At MVP with a small team and small customer count, this overhead is not justified by the throughput requirements. The defined V1 migration path ensures Kafka is adopted when throughput warrants it.

---

## Review Notes

At Sprint 3, this decision will be reviewed to assess:
1. Whether BullMQ + Redis durability has been sufficient (any jobs lost?)
2. Whether queue depth and throughput are approaching Redis limits
3. Whether the V1 Kafka migration timeline needs to be accelerated
4. Whether any domain events need fan-out to multiple consumers that would benefit from Kafka's consumer group model
