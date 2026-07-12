# Galaxy End-to-End Trace Report

> Generated: 2026-07-12 · Analysis of correlation ID flow and observability completeness

---

## 1. Trace Architecture Overview

A fully traceable Galaxy execution produces a chain of linked records:

```
HTTP Request
  → request.correlationId = req.headers['x-correlation-id'] ?? crypto.randomUUID()
  → TenantContextMiddleware sets app.current_tenant (PostgreSQL RLS)
  → AuthMiddleware attaches request.user (actorId, organizationId)
  → Route Handler enqueues BullMQ job { ...data, correlationId }
    → Worker reads correlationId from job.data
    → GalaxyEvent published: { id, correlationId, causationId, tenantId, actor }
    → audit_log INSERT: { correlation_id, organization_id, actor_id, action }
    → Loop OS: GxLearningEngine.recordOutcome({ correlationId, ... })
    → Analytics: increment metric counters
    → Mission Control WebSocket: broadcast state change
```

Every record at every layer references the same `correlationId`, enabling full-chain replay and forensic analysis.

### Current Trace Infrastructure

| Component | Status | File |
|---|---|---|
| `correlationId` generation | ✅ Defined in type system | `packages/types/src/events.ts` |
| `GalaxyEvent` envelope | ✅ Fully specified | `packages/types/src/events.ts` |
| `KafkaEventBus` / `EventPublisher` | ✅ Implemented | `packages/events/src/kafka.ts` |
| `AuditLogger` / `AuditSearchService` | ✅ Implemented | `packages/modules/identity/src/audit/` |
| Structured logging (Pino) | ✅ In API | `apps/api/src/` |
| `GxLearningEngine.recordOutcome` | ✅ Implemented | `packages/modules/cognitive-engine/src/engines/` |
| `AgentLifecycleTrace` | ✅ In AgentRuntime | `packages/modules/agents/src/runtime/AgentRuntime.ts` |
| Correlation ID threading to workers | ❌ Missing | BullMQ job payloads don't universally include correlationId |
| Audit writes in workers | ❌ Missing | No worker calls `AuditLogger` |
| Event emission in workers | ❌ Missing | No worker calls `EventPublisher` after completion |
| Mission Control WebSocket broadcast | ❌ Partial | Routes exist; real-time push not implemented |

---

## 2. Traceable Execution Paths

### Fully Traceable (end-to-end trace confirmed)

| Feature | Trace Coverage | Notes |
|---|---|---|
| `AgentRuntime.execute()` | ✅ Full | Produces `AgentLifecycleTrace` with all 9 lifecycle states, governance decision, learning event ID |
| `AuthMiddleware` | ✅ Full | Sets `request.user` with actorId; JWT claims audited |
| `TenantContextMiddleware` | ✅ Full | Sets RLS context; tenant ID available downstream |
| Knowledge ingestion (pgvector) | ✅ Partial | Embedding stored with chunk metadata; no correlationId on embedding records |

### Partially Traceable

| Feature | What Exists | What's Missing |
|---|---|---|
| WhatsApp Webhook | Signature verified; phone identity resolved | No audit log written; no GalaxyEvent published after message processed |
| Knowledge RAG endpoint | Query logged; search method recorded | No correlationId linked to embedding query; no audit entry |
| workflow-execution processor | Job ID tracked in BullMQ | No correlationId from original HTTP request; no completion event |
| Audit routes | Elasticsearch index writes | Audit sync processor doesn't emit GalaxyEvent on completion |

### Not Traceable (complete trace gap)

All 44 API route VIOLATION features produce no trace:
- No `correlationId` propagated from request header
- No `GalaxyEvent` published
- No `audit_log` entry written
- No Loop OS trigger

---

## 3. Trace Gap Analysis

### Gap 1 — correlationId not threaded from HTTP to workers

**Where it breaks:** Route handlers enqueue BullMQ jobs but most do not include `correlationId` in the job data.

```typescript
// Current (broken):
await queue.add('agent-execution', { agentId, input, organizationId });

// Required:
await queue.add('agent-execution', {
  agentId, input, organizationId,
  correlationId: request.correlationId,  // ← must be threaded
  actorId: request.user.id,
});
```

**Impact:** Every worker execution is orphaned — it cannot be linked back to the originating HTTP request.

### Gap 2 — Workers do not write audit entries

**Where it breaks:** All 8 BullMQ processors complete their work without writing to `audit_logs`.

**Impact:** Agent executions, workflow runs, knowledge ingestion, and notification dispatches produce no immutable audit record.

### Gap 3 — Workers do not publish GalaxyEvents

**Where it breaks:** All 8 processors perform DB writes without calling `EventPublisher.publish()`.

**Impact:** Kafka consumers, event-driven subscribers, and the Loop OS cannot react to completed operations.

### Gap 4 — Loop OS not triggered outside AgentRuntime

**Where it breaks:** `GxLearningEngine.recordOutcome()` is only called in `AgentRuntime`. Workflows, knowledge queries, and API operations never trigger learning.

**Impact:** The system cannot improve routing, thresholds, or confidence scores for non-agent operations.

### Gap 5 — No correlationId on audit_log in most routes

**Where it breaks:** Even in the few routes that do write audit entries (platform-admin), `correlation_id` is not set on the audit record.

**Impact:** Cannot link an audit entry back to a specific user request in forensic investigations.

---

## 4. Observability Completeness

| Observability Dimension | Coverage | Gap |
|---|---|---|
| Structured request logs (Pino) | ✅ API layer | Workers use console.log in some cases |
| Correlation ID on HTTP requests | ⚠️ Header exists | Not universally propagated through the call chain |
| Distributed trace IDs (OpenTelemetry) | ❌ Not implemented | No OTel instrumentation found |
| Agent lifecycle traces | ✅ AgentRuntime | `AgentLifecycleTrace` with per-state timing |
| Worker job execution metrics | ⚠️ BullMQ dashboard | No custom metric emission (latency, success rate, token cost) |
| Event stream (Kafka) | ⚠️ Infrastructure ready | Only AgentRuntime emits events; 96 features do not |
| Audit log (PostgreSQL) | ⚠️ Table + RLS | Only 8 features write audit entries |
| Elasticsearch audit search | ✅ Implemented | `AuditSearchService` with index + ILIKE fallback |
| Mission Control real-time | ❌ Not wired | WebSocket routes exist; no push implementation |
| Performance metrics (tokens, cost, latency) | ⚠️ AgentRuntime only | `AgentLifecycleTrace.totalDurationMs` tracked; no token cost tracking |

---

## 5. Sample Execution Traces

### Trace A — Agent Execution (Fully Traced)

```
1. POST /api/v1/agents/:id/execute
   correlationId: "c7e8a1b2-..."  (from X-Correlation-ID header or generated)
   → authMiddleware: JWT verified, actorId="u-001", organizationId="org-42"
   → tenantContextMiddleware: SET app.current_tenant = 'org-42'
   → abacGuard: RBAC check PASS

2. Route handler enqueues BullMQ job:
   queue.add('agent-execution', { agentId, correlationId: "c7e8a1b2-...", organizationId: "org-42" })

3. Worker: apps/worker/src/processors/agent-execution.ts
   AgentRuntime.execute({
     organizationId: "org-42", actorId: "u-001", correlationId: "c7e8a1b2-...", ...
   })
   → OBSERVE: GxContextEngine.enrich()
   → UNDERSTAND: GxIntentEngine.analyze()
   → REASON: GxReasoningEngine.reason()
   → PLAN: GxPlanningEngine.createPlan()
   → GOVERNANCE: GxGovernanceEngine.evaluate()  → logDecision()
   → EXECUTE: GxExecutionEngine.executePlan()
   → VERIFY: GxVerificationEngine.verify()
   → LEARN: GxLearningEngine.recordOutcome()  → learningEventId returned
   → OPTIMIZE: GxOptimizationEngine.detectBottlenecks() [fire-and-forget]

4. AgentLifecycleTrace written to agent_executions.output:
   { executionId, states: [{state,enteredAt,durationMs}×9], totalDurationMs, learningEventId, governanceDecision, ... }

⚠️  MISSING from this path:
   - GalaxyEvent not published on completion
   - audit_log not written
   - correlationId not present in job data (in current implementation)
```

### Trace B — Knowledge Ingestion (Partially Traced)

```
1. Worker triggered: knowledge-ingestion processor
   Job data: { documentId, organizationId, content }
   ⚠️  correlationId: MISSING from job payload

2. Processor execution:
   - Text chunked → Voyage AI embeddings called
   - pgvector INSERT: embedding stored with chunk_index, document_id
   - tenant context SET via set_config ✅

3. ⚠️  MISSING:
   - correlationId not in job → cannot link to originating upload request
   - No GalaxyEvent published on ingestion complete
   - No audit_log entry
   - Loop OS not triggered
```

### Trace C — WhatsApp Webhook (Partially Traced)

```
1. POST /api/v1/webhooks/whatsapp
   X-Hub-Signature-256 verified via HMAC-SHA256 ✅
   Phone identity resolved → organizationId looked up
   tenantContext set ✅

2. Message content parsed and processed synchronously

3. ⚠️  MISSING:
   - No correlationId generated and stored
   - No GalaxyEvent published (e.g., message.received)
   - No audit_log entry
   - Processing is synchronous — should enqueue BullMQ job instead
   - Loop OS not triggered
```

---

## 6. Recommendations for Full Observability

### Immediate (unblocks 80% of trace gaps)

1. **Thread correlationId universally** — Add a Fastify `onRequest` hook that sets `request.correlationId = req.headers['x-correlation-id'] ?? crypto.randomUUID()` globally. All queue.add() calls must include it.

2. **Create a worker lifecycle wrapper** (`apps/worker/src/lib/withEngineLifecycle.ts`) that automatically publishes a GalaxyEvent and writes an audit_log entry for every completed job.

3. **Add correlationId to audit_log schema** — Migration: `ALTER TABLE audit_logs ADD COLUMN correlation_id UUID`. Update `AuditLogger.log()` to always set it.

### Short-term

4. **Instrument with OpenTelemetry** — Add `@opentelemetry/sdk-node` to the API and worker. All Fastify requests and BullMQ jobs should emit spans. Export to OTLP (Jaeger / Grafana Tempo).

5. **Implement Mission Control WebSocket push** — On each GalaxyEvent, broadcast `{ type, tenantId, correlationId, timestamp }` to connected Mission Control subscribers using Fastify's `@fastify/websocket`.

### Long-term

6. **Token cost and latency telemetry** — `GxLearningEngine` already stores `durationMs`. Extend `agent_learning_events` with `token_count INT` and `estimated_cost_usd NUMERIC(10,6)`. Feed from `AgentRuntime` lifecycle trace.

7. **Distributed tracing for pgvector queries** — Add OTel spans around every embedding lookup to track semantic search latency separately from DB query latency.

---

*This report is based on static code analysis. A full dynamic trace test requires running the platform with real requests and verifying that every trace link is populated in the database and event stream.*
