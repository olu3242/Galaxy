# Galaxy System Architecture

This document describes the eight architectural layers of the Galaxy Loop OS platform, their responsibilities, key components, interfaces to adjacent layers, and known failure modes. It also covers cross-cutting concerns that span all layers.

---

## Architectural Overview

Galaxy is a multi-tenant Organization Operating System delivered primarily through WhatsApp. The system is designed as an event-driven, asynchronous platform where no operation is executed synchronously from a webhook handler. All state changes are processed by background workers and produce immutable audit log entries.

```
┌─────────────────────────────────────────────────────────────────┐
│  Presentation Layer   (Next.js Web Dashboard / WhatsApp)        │
├─────────────────────────────────────────────────────────────────┤
│  API Layer            (Fastify REST + WebSocket Gateway)        │
├─────────────────────────────────────────────────────────────────┤
│  Workflow Layer       (BullMQ Job Queue + Workers)              │
├─────────────────────────────────────────────────────────────────┤
│  Agent Layer          (AI Agent Runtime + Tool Registry)        │
├─────────────────────────────────────────────────────────────────┤
│  Integration Layer    (WhatsApp Cloud API + Webhooks)           │
├─────────────────────────────────────────────────────────────────┤
│  Analytics Layer      (Event Aggregation + Loop Engine)         │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer           (PostgreSQL RLS + Redis + Vector Store)   │
├─────────────────────────────────────────────────────────────────┤
│  Security Layer       (Auth + RBAC + Tenant Isolation + Audit)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Presentation Layer

### Responsibilities

- Provide the Mission Control web dashboard for executives, managers, and admins
- Surface workflow statuses, approval queues, analytics dashboards, and org charts
- Render real-time updates via WebSocket subscriptions for live workflow and notification feeds
- Provide the WhatsApp conversational interface for mobile-first members who interact entirely through WhatsApp messages
- Serve as the primary channel for bulk import flows, workflow submission, and approval responses via WhatsApp

### Key Components

| Component             | Technology                                  | Purpose                                                             |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web`            | Next.js 14 (App Router)                     | Web dashboard — Mission Control                                     |
| Web Dashboard Pages   | React Server Components + Client Components | Org chart, workflow list, approval queue, analytics, admin settings |
| Real-Time Feed        | WebSocket client (native browser API)       | Live workflow status updates and notifications                      |
| WhatsApp Interface    | Meta WhatsApp mobile client                 | Primary mobile interface for field members                          |
| WhatsApp Flow Handler | Inbound message state machine (server-side) | Conversational flows for workflow triggers, approvals, reports      |

### Interfaces to Adjacent Layers

- **To API Layer (down):** HTTP REST calls for data fetch/mutations; WebSocket connection for real-time subscriptions
- **From API Layer (up):** JSON REST responses; WebSocket push events for live updates

### Failure Modes

- **Web dashboard unavailable:** Members fall back to WhatsApp-only operation. Core workflow and approval functionality continues uninterrupted.
- **WebSocket disconnection:** Client reconnects with exponential backoff. Missed events are fetched via REST poll on reconnection.
- **WhatsApp service degradation (Meta):** Inbound messages queue in Meta's infrastructure. When service resumes, webhooks replay. The platform must be idempotent on duplicate wamid delivery.

---

## Layer 2: API Layer

### Responsibilities

- Expose a versioned REST API (`/api/v1/`) for web dashboard and external integrations
- Handle WhatsApp webhook verification (GET) and event delivery (POST) at `/api/v1/webhooks/whatsapp`
- Enforce the full request security pipeline: tenant resolution → authentication → RBAC
- Validate all incoming payloads against typed schemas before enqueuing jobs
- Expose WebSocket endpoint for real-time dashboard subscriptions
- Never execute business logic synchronously — all mutations enqueue a BullMQ job

### Key Components

| Component                 | Technology                     | Purpose                                                                   |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `apps/api`                | Fastify v4                     | High-performance HTTP + WebSocket server                                  |
| `TenantContextMiddleware` | Fastify plugin                 | Resolves organizationId from JWT or webhook routing, sets RLS context     |
| `AuthMiddleware`          | Fastify plugin                 | Validates JWT tokens; resolves WhatsApp phone identity for webhook paths  |
| `PermissionGuard`         | Fastify hook                   | Evaluates RBAC permissions before handler execution                       |
| Route Handlers            | Fastify route plugins          | Per-domain route modules: identity, people, workflow, communication, etc. |
| WebSocket Handler         | Fastify + `@fastify/websocket` | Real-time subscription management per tenant                              |
| Webhook Receiver          | Fastify route                  | HMAC-SHA256 signature verification + event enqueue                        |
| Request Validator         | Zod schemas                    | Runtime type validation of all request bodies and query params            |

### Interfaces to Adjacent Layers

- **To Presentation Layer (up):** REST JSON responses; WebSocket push events
- **To Workflow Layer (down):** BullMQ job enqueue calls
- **To Security Layer (cross-cutting):** JWT validation, RLS context setting, RBAC evaluation
- **To Integration Layer:** Webhook ingestion from WhatsApp Cloud API

### Failure Modes

- **API process crash:** Docker/ECS restart policy brings it back. Load balancer health check removes unhealthy instance.
- **JWT secret rotation:** Existing tokens become invalid. Rolling secret rotation with dual-validation window is required.
- **RLS context not set:** Database query will return zero rows (RLS denies all). The middleware must throw before reaching handlers if context resolution fails.
- **Webhook replay from Meta:** Duplicate wamid must be deduplicated by the Communication OS worker using the wamid as an idempotency key.

---

## Layer 3: Workflow Layer

### Responsibilities

- Process all asynchronous jobs via BullMQ workers
- Execute OS module business logic (workflow steps, task assignment, notifications, etc.)
- Publish `GalaxyEvent` instances to the internal event bus after each state change
- Trigger the Audit Logger for every state-changing job
- Manage job retries, dead-letter routing, and concurrency limits per queue

### Key Components

| Component                       | Technology                | Purpose                                                                                                                          |
| ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker`                   | Node.js + BullMQ          | Worker process hosting all queue processors                                                                                      |
| Queue definitions               | BullMQ `Queue` instances  | Named queues per domain: `workflow-execution`, `notification-dispatch`, `agent-session`, `audit-writer`, `analytics-aggregation` |
| Queue processors                | BullMQ `Worker` instances | Per-queue processor functions invoking OS module services                                                                        |
| `WorkflowExecutionEngine`       | Domain service            | Advances workflow run state machine                                                                                              |
| `NotificationDispatchProcessor` | Queue processor           | Sends WhatsApp messages via Communication OS                                                                                     |
| `AuditWriterProcessor`          | Queue processor           | Writes audit log entries (consumes from `audit-writer` queue)                                                                    |
| Event Publisher                 | Internal module           | Wraps BullMQ event emission with `GalaxyEvent` envelope                                                                          |

### Interfaces to Adjacent Layers

- **From API Layer (up):** Job data received via BullMQ queue
- **To Data Layer (down):** Database reads/writes via typed query helpers
- **To Integration Layer:** Outbound WhatsApp API calls via Communication OS
- **To Analytics Layer:** Published `GalaxyEvent` instances consumed by analytics aggregation worker
- **To Security Layer (cross-cutting):** Sets RLS context per job; validates tenant context before any DB operation

### Failure Modes

- **Worker process crash mid-job:** BullMQ marks the job as failed and reschedules per retry policy. Jobs are atomic at the BullMQ level.
- **Database connection pool exhaustion:** Jobs queue and retry with backoff. Alerting fires if queue depth exceeds threshold.
- **Poison message (perpetually failing job):** After max retries, job moves to DLQ. Alert fires. Manual replay after root cause resolution.
- **Redis unavailable:** BullMQ cannot dequeue jobs. The API layer can still accept requests (they queue in Redis). If Redis is down, no jobs process until Redis recovers.

---

## Layer 4: Agent Layer

### Responsibilities

- Host the AI agent runtime (Anthropic Claude via the Anthropic SDK)
- Maintain and execute registered agent tools that map to OS module operations
- Run the `AutomationGovernanceGuard` before every agent write action
- Manage human-in-the-loop approval flows for Tier 3–4 impact actions
- Record complete, structured audit trails for all agent decisions and tool invocations

### Key Components

| Component                   | Technology                          | Purpose                                                                  |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `AgentRuntimeService`       | Anthropic SDK (`claude-sonnet-4-6`) | Runs agent sessions, dispatches tool calls, collects results             |
| `ToolRegistryService`       | In-memory registry + DB             | Catalogs available tools with input/output schemas                       |
| `AutomationGovernanceGuard` | Domain service                      | Classifies impact tier, auto-approves 1–2, routes 3–4 for human approval |
| `HumanInTheLoopService`     | Communication OS integration        | Sends approval request via WhatsApp, awaits response                     |
| Agent Session Processor     | BullMQ worker                       | Executes agent sessions asynchronously from the job queue                |
| `AgentAction` recorder      | Domain service                      | Persists every tool invocation with governance outcome                   |

### Interfaces to Adjacent Layers

- **From Workflow Layer (up):** Agent sessions initiated as BullMQ jobs
- **To Integration Layer:** Anthropic API calls for LLM inference
- **To all OS Modules (cross-cutting):** Tool calls invoke OS module domain services
- **To Communication OS:** Human-in-the-loop notifications sent via Communication OS
- **To Security Layer (cross-cutting):** Every tool call is subject to RBAC + governance guard

### Failure Modes

- **Anthropic API timeout or rate limit:** Agent session fails gracefully; member is notified via WhatsApp. Session can be retried.
- **Human approval timeout (Tier 3–4):** `expires_at` on the `GovernanceApproval` triggers auto-cancellation. The action is blocked and recorded.
- **Tool invocation error:** Agent receives structured error response. The agent may retry with different parameters or escalate to member for clarification.
- **Governance guard bypass attempt:** Any tool call that bypasses the guard fails at the registry layer with a `ForbiddenError`, which is non-retryable.

---

## Layer 5: Integration Layer

### Responsibilities

- Manage the bidirectional interface with the WhatsApp Cloud API (Meta)
- Receive and verify incoming webhooks from Meta (HMAC-SHA256 validation)
- Route inbound webhooks to the correct tenant context by `phone_number_id`
- Send outbound messages via the WhatsApp Cloud API with delivery confirmation tracking
- Manage WABA (WhatsApp Business Account) credentials per organization
- Support future integrations (email, SMS, third-party webhooks) behind a unified connector interface

### Key Components

| Component                   | Technology                    | Purpose                                                 |
| --------------------------- | ----------------------------- | ------------------------------------------------------- |
| WhatsApp Cloud API Client   | Meta Graph API v18+           | Sends messages, manages templates                       |
| Webhook Receiver            | Fastify route in API layer    | Verifies signature, routes to tenant, enqueues job      |
| `WebhookRoutingService`     | Domain service                | Resolves `phone_number_id` → `organization_id` mapping  |
| `MessageDispatchService`    | Domain service                | Constructs and sends WhatsApp API requests              |
| `TemplateManagementService` | Domain service                | Submits and syncs message template approvals            |
| WABA Credential Manager     | AWS Secrets Manager reference | Fetches per-org WABA access tokens from Secrets Manager |

### Interfaces to Adjacent Layers

- **From Meta (external):** Webhook POST to `/api/v1/webhooks/whatsapp`
- **To Meta (external):** HTTPS calls to `graph.facebook.com`
- **To API Layer:** Webhook verification result and enqueued job reference
- **From Workflow Layer:** Outbound message dispatch jobs consumed from `notification-dispatch` queue
- **To Security Layer:** HMAC signature verification; credential retrieval from Secrets Manager

### Failure Modes

- **Meta API rate limit:** Exponential backoff with jitter. Notification delivery jobs retry automatically.
- **WABA access token expired:** Credential Manager detects 401 response, triggers credential refresh from Secrets Manager, retries.
- **Invalid webhook signature:** Request rejected immediately with 403. No job enqueued. Event logged to audit.
- **phone_number_id not mapped to a tenant:** Webhook dropped. Alert fires. Possible new-customer onboarding flow required.

---

## Layer 6: Analytics Layer

### Responsibilities

- Consume the `GalaxyEvent` stream and aggregate metrics into `MetricSnapshot` records
- Calculate workflow completion rates, task SLA adherence, approval turnaround times, and agent action analytics
- Power the Loop Engine: detect bottlenecks, compliance gaps, and efficiency opportunities using time-window analysis
- Serve pre-aggregated metrics to the web dashboard via the API layer
- Generate scheduled reports (daily, weekly, monthly) for executives

### Key Components

| Component                     | Technology     | Purpose                                                                       |
| ----------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `analytics-aggregation` queue | BullMQ         | Consumes GalaxyEvents and triggers metric computation                         |
| `MetricAggregationService`    | Domain service | Computes and stores `MetricSnapshot` records                                  |
| `LoopEngineService`           | Domain service | Runs pattern detection queries over rolling time windows                      |
| `ReportGenerationService`     | Domain service | Builds structured reports from metric snapshots                               |
| `SlaMonitoringService`        | Domain service | Polls for overdue tasks and pending approvals; emits `analytics.sla.breached` |
| Dashboard API                 | REST endpoint  | Serves aggregated metric data to the web dashboard                            |

### Interfaces to Adjacent Layers

- **From Workflow Layer (up):** Consumes published `GalaxyEvent` instances
- **To Data Layer (down):** Reads events table; writes to metric_snapshots and ai_insights tables
- **To Presentation Layer:** Serves pre-aggregated metrics via API layer
- **To Governance OS:** Sends `analytics.sla.breached` events consumed by Governance OS policy enforcement

### Failure Modes

- **Analytics aggregation lag:** If the analytics queue falls behind, dashboards show slightly stale data. This is acceptable (eventual consistency model). Alerts fire if lag exceeds configurable threshold (default: 5 minutes).
- **Loop Engine false positive insight:** Insights are recommendations, not automated actions. Members dismiss irrelevant insights. Governance feedback loop improves detection over time.
- **Report generation failure:** Report job retries per standard retry policy. On max-retry failure, member is notified and can regenerate manually.

---

## Layer 7: Data Layer

### Responsibilities

- Persist all application state with strong tenant isolation guarantees
- Enforce Row-Level Security at the database level for all tenant-scoped tables
- Provide the append-only event store (`events` table) and INSERT-only audit log (`audit_logs`)
- Supply low-latency caching and BullMQ job persistence via Redis
- Store and query document vector embeddings for Knowledge OS semantic search

### Key Components

| Component        | Technology                                                  | Purpose                                                         |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Primary Database | PostgreSQL 15+                                              | Main application data store with RLS                            |
| Connection Pool  | `pg` + `pgBouncer`                                          | Connection pooling; each connection sets RLS context before use |
| Redis            | Redis 7+                                                    | BullMQ job queue backend; session cache; rate limiting counters |
| Vector Store     | pgvector extension (PostgreSQL)                             | Stores document embeddings; supports nearest-neighbor queries   |
| Migration Runner | Sequential migration files in `apps/api/src/db/migrations/` | Schema version management                                       |
| Query Helpers    | Typed query builder (`packages/utils`)                      | Parameterized queries; never raw string interpolation           |

### Interfaces to Adjacent Layers

- **From Workflow Layer (up):** Reads/writes per domain entity
- **From Analytics Layer:** Reads events table; writes metric snapshots
- **To Security Layer (cross-cutting):** RLS policies enforce tenant isolation; `set_config` sets context per connection

### Failure Modes

- **PostgreSQL primary failure:** Failover to read replica (promotion). Brief write downtime. Workers retry with backoff.
- **RLS misconfiguration (missing `organization_id` filter in policy):** Cross-tenant data leak is possible. Mitigation: mandatory cross-tenant isolation test in CI before any schema migration merges.
- **Redis failure:** BullMQ cannot process jobs. API can still accept requests (they fail to enqueue and return 503). Recovery requires Redis restart and potential job replay.
- **Vector store query timeout:** Semantic search falls back to keyword search. Knowledge OS degrades gracefully.
- **Connection pool exhaustion:** New connections are queued. If queue exceeds timeout, requests fail with 503.

---

## Layer 8: Security Layer

### Responsibilities

- Authenticate all actors: member JWT validation, WhatsApp phone identity verification, system service tokens
- Enforce Role-Based Access Control (RBAC) on every API operation
- Maintain tenant isolation across all layers: RLS, event filtering, job scoping
- Provide the immutable audit trail via INSERT-only `audit_logs` table
- Manage secrets via AWS Secrets Manager (no secrets in environment variables or code)
- Run continuous security controls: dependency audits, secret scanning, CodeQL analysis

### Key Components

| Component                       | Technology                    | Purpose                                                                        |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| JWT Authentication              | `@fastify/jwt` + RS256        | Issues and validates signed JWTs with tenantId, memberId, roles claims         |
| WhatsApp Signature Verification | `crypto.createHmac` (SHA-256) | HMAC verification of all inbound Meta webhooks                                 |
| `PermissionGuard`               | Fastify hook                  | Evaluates RBAC permissions before handler execution                            |
| `AutomationGovernanceGuard`     | Agent OS domain service       | Classifies agent action impact; blocks or routes Tier 3–4                      |
| Row-Level Security              | PostgreSQL RLS policies       | Database-level tenant isolation; cannot be bypassed by application code        |
| Audit Logger                    | Governance OS + BullMQ        | Writes immutable, hash-chained audit log entries                               |
| Secrets Manager                 | AWS Secrets Manager           | Stores WABA tokens, JWT secrets, DB credentials; never in `.env` in production |
| Secret Scanner                  | gitleaks (CI)                 | Blocks commits containing secrets                                              |
| Dependency Auditor              | `pnpm audit` (CI)             | Flags high/critical CVEs in dependencies                                       |

### Interfaces to Adjacent Layers

- **To API Layer:** Provides middleware hooks: `TenantContextMiddleware`, `AuthMiddleware`, `PermissionGuard`
- **To Data Layer:** Provides RLS context via `set_config`; INSERT-only policy on `audit_logs`
- **To Integration Layer:** Provides HMAC verification utility; Secrets Manager credential retrieval
- **To all layers (cross-cutting):** Audit logging consumers receive events from all OS modules

### Failure Modes

- **JWT secret unavailable at startup:** API process fails to start. Infrastructure alerts. Recovery: restore secret from Secrets Manager.
- **RLS context not set before query:** Database returns zero rows. This is a silent data leak prevention. Application must always set context before querying.
- **Audit writer queue backed up:** State changes continue to succeed, but audit entries are delayed. Alerting fires. Audit entries are never dropped — jobs retry until written.
- **RBAC policy evaluation error:** Default-deny behavior: if the guard throws, the request is rejected with 403. Never default-allow on guard failure.

---

## Cross-Cutting Concerns

### Observability

**Structured Logging:** All log output is structured JSON using `pino`. Every log entry includes `correlationId`, `tenantId`, `actorId`, and `actorType`. Fields listed in the redaction policy (`phone`, `whatsapp_phone`, `token`, `secret`, `password`, `api_key`, `authorization`) are automatically redacted by the logging configuration.

**Distributed Tracing:** `correlationId` propagates through the entire request chain — API handler → BullMQ job data → worker → event payload → audit log. This enables end-to-end trace reconstruction without a separate tracing infrastructure in MVP.

**Metrics:** BullMQ exposes queue depth, throughput, and failure rates. These are scraped by the analytics layer and exposed on the platform admin health dashboard.

**Health Checks:** Each app exposes a `/health` endpoint returning service status, database connectivity, and Redis connectivity. Load balancers use this for traffic routing.

**Alerting:** DLQ depth, queue lag, error rate thresholds, and SLA breaches trigger webhook alerts to the platform on-call channel.

---

### Secrets Management

All secrets are stored in AWS Secrets Manager and loaded at runtime. No secrets appear in source code, `.env` files committed to the repository, or application logs.

**Secret categories:**

- Database credentials: `galaxy/db/{environment}`
- Redis credentials: `galaxy/redis/{environment}`
- JWT signing key: `galaxy/jwt/{environment}`
- WhatsApp App Secret: `galaxy/whatsapp/app-secret`
- Per-org WABA access tokens: `galaxy/waba/{organizationId}`
- Anthropic API key: `galaxy/anthropic/{environment}`

Local development uses `.env` files (never committed, covered by `.gitignore`). The `.env.example` file documents required variable names without values.

---

### Error Handling

**Principle:** Errors are classified, logged, and surfaced appropriately. Internal errors are never exposed to external callers in production.

| Error Class               | Behavior                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| `ValidationError`         | 400 response; logged at `warn`; non-retryable in worker           |
| `UnauthorizedError`       | 401 response; logged at `warn`; auth audit event emitted          |
| `ForbiddenError`          | 403 response; logged at `warn`; RBAC audit event emitted          |
| `NotFoundError`           | 404 response; logged at `info`                                    |
| `ConflictError`           | 409 response; logged at `warn`; may be retried with deduplication |
| `InternalError`           | 500 response; logged at `error` with stack; alert triggered       |
| `ServiceUnavailableError` | 503 response; logged at `error`; upstream retry appropriate       |

Worker errors follow the retry policy defined in the Event Fabric document. Non-retryable errors move immediately to the DLQ. All error classes are defined in `packages/utils/src/errors.ts`.
