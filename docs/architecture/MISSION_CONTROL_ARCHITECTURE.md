# Galaxy Mission Control Architecture

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Overview

Galaxy Mission Control is the operational command centre for the Workstream Reliability Framework. It provides real-time visibility into every active workstream execution, queue health, agent utilisation, dependency status, and runtime diagnostics.

Mission Control is not a feature dashboard. It is the platform's self-observability layer.

---

## API Surface

All Mission Control endpoints are admin-only (`x-admin-secret` header required).

| Endpoint                                    | Purpose                                    |
| ------------------------------------------- | ------------------------------------------ |
| `GET /api/v1/admin/runtime/workstreams`     | Active workstream executions               |
| `GET /api/v1/admin/runtime/health`          | Platform-wide dependency health matrix     |
| `GET /api/v1/admin/runtime/workstreams/:id` | Drill-down: per-workstream telemetry trace |
| `GET /api/v1/admin/runtime/intelligence`    | Full Runtime Intelligence response         |
| `GET /api/v1/admin/runtime/health-matrix`   | Workstream Health Matrix (release gate)    |

Route module: `apps/api/src/routes/wrf.ts`

---

## Runtime Intelligence API

```
GET /api/v1/admin/runtime/intelligence

Response:
{
  "workstreams": {
    "active":            [...],   // Running / queued / planning
    "waiting":           [...],   // Waiting on external input (approval, upload)
    "failed":            [...],   // Failed and not auto-recovered
    "recentlyCompleted": [...]    // Last 20 completions
  },
  "agents": {
    "total": 48, "busy": 12, "idle": 36, "failed": 0
  },
  "dependencies": {
    "overall": "healthy",
    "dependencies": [ ... ]       // Per-dependency health
  },
  "runtime": {
    "p50LatencyMs":          340,
    "p95LatencyMs":         1200,
    "p99LatencyMs":         3100,
    "errorRate":            0.012,
    "throughputPerMinute":   8.4
  },
  "queues": {
    "intent-detection":    { "depth": 3, "processingRate": 2.1, "oldestJobAgeMs": 1200 },
    "workflow-execution":  { "depth": 7, "processingRate": 3.8, "oldestJobAgeMs":  800 }
  },
  "knowledge": {
    "retrievalSuccessRate": 0.987,
    "avgLatencyMs": 210
  },
  "memory": {
    "utilizationPercent": 42
  },
  "health": "healthy"
}
```

---

## Workstream Summary Fields

Each entry in the `workstreams` arrays conforms to `WorkstreamSummary`:

| Field                       | Description                            |
| --------------------------- | -------------------------------------- |
| `workstreamId`              | Unique execution ID                    |
| `organizationId`            | Tenant                                 |
| `channel`                   | Origin channel (whatsapp, web, api, …) |
| `intent`                    | Classified intent                      |
| `executionState`            | Current state                          |
| `currentStage`              | Current WRF lifecycle stage            |
| `retryCount`                | Retries attempted                      |
| `latencyMs`                 | Wall-clock duration from start         |
| `agentCount`                | Number of agents assigned              |
| `health`                    | Composite health signal                |
| `startedAt` / `completedAt` | Timestamps                             |

---

## Data Sources

| Data               | Source Table                                               |
| ------------------ | ---------------------------------------------------------- |
| Active workstreams | `workstream_checkpoints` (latest per workstream_id)        |
| Stage telemetry    | `workstream_telemetry`                                     |
| Agent utilisation  | `autonomous_agents`                                        |
| Knowledge health   | `workstream_telemetry` WHERE stage = 'knowledge_retrieval' |
| Dependency health  | Live probes from `DependencyHealthService`                 |

---

## Workstream Drill-Down

```
GET /api/v1/admin/runtime/workstreams/:workstreamId

Response:
{
  "checkpoint": {
    "workstreamId": "...",
    "stage": "task_execution",
    "executionState": "running",
    "retryCount": 1,
    "savedAt": "2026-07-24T10:01:23Z"
  },
  "telemetry": [
    { "stage": "event_received",      "durationMs":   3, "success": true  },
    { "stage": "identity_resolution", "durationMs":  12, "success": true  },
    { "stage": "intent_detection",    "durationMs": 890, "success": true  },
    { "stage": "knowledge_retrieval", "durationMs": 340, "success": false,
      "errorCode": "KNOWLEDGE_RETRIEVAL_TIMEOUT", "retryCount": 1          },
    { "stage": "knowledge_retrieval", "durationMs": 210, "success": true,
      "retryCount": 2                                                       },
    ...
  ],
  "stageCount": 9,
  "totalDurationMs": 1820
}
```

---

## Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │     Galaxy Mission Control       │
                    │   /admin/runtime/workstreams     │
                    └────────────┬────────────────────┘
                                 │
              ┌──────────────────┼───────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
 workstream_checkpoints   workstream_telemetry  DependencyHealthService
  (active executions)      (stage timings)      (live probes)
              │                  │                   │
              └──────────────────┴───────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  WorkstreamRuntimeService│
                    │  packages/modules/platform│
                    └─────────────────────────┘
```

---

## Deployment Note

Mission Control routes (`/admin/runtime/*`) bypass JWT auth and RLS. They require only the `x-admin-secret` header. Never expose these routes to the public internet without an additional network-layer control (VPN, internal VLAN, or IP allowlist).
