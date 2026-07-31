# Galaxy Workstream Dependency Graph

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Overview

Every workstream in Galaxy declares a set of dependencies. The Dependency Health Service pings each dependency on demand and returns a health matrix. The Mission Control API exposes this matrix in real time at `GET /api/v1/admin/runtime/health`.

---

## Declared Dependencies

| Dependency             | Type                                  | Health Impact                               | Critical     |
| ---------------------- | ------------------------------------- | ------------------------------------------- | ------------ |
| `identity_service`     | PostgreSQL (`users` table)            | Auth failure blocks all workstreams         | ✅ Yes       |
| `organization_service` | PostgreSQL (`organizations` table)    | Tenant resolution blocks all workstreams    | ✅ Yes       |
| `workflow_os`          | PostgreSQL (`workflow_runs` + BullMQ) | Workflow creation / status blocked          | ✅ Yes       |
| `agent_os`             | PostgreSQL (`autonomous_agents`)      | AI task execution degraded                  | ✅ Yes       |
| `knowledge_os`         | PostgreSQL (`knowledge_documents`)    | Knowledge retrieval retries / fallback      | ⚠️ Retryable |
| `memory_engine`        | PostgreSQL (`org_memories`)           | Memory read degraded; writes queued         | ⚠️ Retryable |
| `ai_coordinator`       | Anthropic API                         | Intent + planning degraded                  | ⚠️ Retryable |
| `postgresql`           | PostgreSQL primary                    | All RLS-gated writes blocked                | ✅ Yes       |
| `redis`                | Redis / BullMQ                        | Queue submission / worker polling blocked   | ✅ Yes       |
| `queue`                | BullMQ                                | Async job dispatch blocked                  | ✅ Yes       |
| `whatsapp_runtime`     | Meta Cloud API                        | Inbound messages buffered; outbound blocked | ✅ Yes       |
| `notification_engine`  | PostgreSQL (`notifications`)          | Delivery retried up to 3x                   | ⚠️ Retryable |
| `loop_os`              | PostgreSQL (`loop_instances`)         | Verification deferred; learning queued      | ⚠️ Retryable |
| `audit_service`        | PostgreSQL (`audit_logs`)             | Compliance risk; workstream halted          | ✅ Yes       |

---

## Health Levels

| Level         | Meaning                                          | Workstream Impact            |
| ------------- | ------------------------------------------------ | ---------------------------- |
| `healthy`     | Latency within SLA; no errors                    | Full functionality           |
| `warning`     | Elevated latency or intermittent errors          | Minor slowdowns              |
| `degraded`    | Partial functionality; automatic fallback active | Some features unavailable    |
| `unavailable` | Dependency unreachable                           | Workstream blocked or failed |

---

## Dependency Graph

```
WhatsApp Message
      │
      ▼
organization_service ──→ identity_service
      │
      ▼
workflow_os ──→ redis ──→ queue
      │
      ▼
ai_coordinator ──→ knowledge_os ──→ memory_engine
      │
      ▼
agent_os
      │
      ▼
notification_engine ──→ whatsapp_runtime
      │
      ▼
audit_service ──→ loop_os
```

---

## Health Probes

The `DependencyHealthService` (`packages/modules/platform/src/workstream/DependencyHealthService.ts`) pings each dependency:

| Dependency             | Probe                               | Warning Threshold |
| ---------------------- | ----------------------------------- | ----------------- |
| `postgresql`           | `SELECT 1`                          | > 500ms           |
| `redis`                | PING                                | > 200ms           |
| `workflow_os`          | COUNT active workflow_runs          | Query error       |
| `agent_os`             | COUNT active autonomous_agents      | Query error       |
| `knowledge_os`         | COUNT published knowledge_documents | Query error       |
| `audit_service`        | SELECT 1 FROM audit_logs            | Query error       |
| `notification_engine`  | SELECT 1 FROM notifications         | Query error       |
| `identity_service`     | SELECT 1 FROM users                 | Query error       |
| `organization_service` | SELECT 1 FROM organizations         | Query error       |

All probes complete within 2 seconds. No probe issues DML statements.

---

## Overall Health Computation

```
UNAVAILABLE if any dependency is unavailable
DEGRADED    if any dependency is degraded
WARNING     if any dependency is warning
HEALTHY     otherwise
```

---

## Mission Control Integration

```
GET /api/v1/admin/runtime/health
Authorization: x-admin-secret: <secret>

Response:
{
  "organizationId": "platform",
  "generatedAt": "2026-07-24T10:00:00Z",
  "overall": "healthy",
  "dependencies": [
    { "name": "postgresql", "health": "healthy", "latencyMs": 12, ... },
    { "name": "redis",      "health": "healthy", "latencyMs": 3,  ... },
    ...
  ]
}
```
