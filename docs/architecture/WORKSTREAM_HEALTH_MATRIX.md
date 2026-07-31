# Galaxy Workstream Health Matrix

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

The Workstream Health Matrix is a cross-dimensional health snapshot of every active workstream channel, AI subsystem, and dependency. It is:

1. **Regenerated automatically** at every deployment gate
2. **Available on demand** via `GET /api/v1/admin/runtime/health-matrix`
3. **A mandatory release blocker** when any dimension fails its threshold

---

## Matrix Structure

```
| Workstream     | Channel  | AI    | Workflow | Agents | Knowledge | Memory | Queue | Notifications | Runtime | Status |
|----------------|----------|-------|----------|--------|-----------|--------|-------|---------------|---------|--------|
| Leave Request  | WhatsApp | ✅    | ✅       | ✅     | ✅        | ✅     | ✅    | ✅            | 340ms   | ✅     |
| Expense Approv | WhatsApp | ✅    | ✅       | ✅     | ⚠️       | ✅     | ✅    | ✅            | 890ms   | ⚠️    |
| Incident Report| WhatsApp | ✅    | ✅       | ✅     | ✅        | ✅     | ✅    | ✅            | 210ms   | ✅     |
| Attendance     | WhatsApp | ✅    | N/A      | N/A    | N/A       | ✅     | ✅    | ✅            |  80ms   | ✅     |
| Member Reg     | WhatsApp | ✅    | N/A      | N/A    | N/A       | ✅     | ✅    | ✅            | 120ms   | ✅     |
| Knowledge QA   | WhatsApp | ✅    | N/A      | ✅     | ✅        | ✅     | ✅    | ✅            | 1200ms  | ✅     |
```

---

## Dimension Definitions

| Dimension         | Source                                       | Healthy Threshold        |
| ----------------- | -------------------------------------------- | ------------------------ |
| **Channel**       | WhatsApp webhook delivery success rate       | ≥ 99%                    |
| **AI**            | Intent detection + AI planning success rate  | ≥ 95%                    |
| **Workflow**      | workflow_runs completion rate                | ≥ 95%                    |
| **Agents**        | autonomous_agents task completion rate       | ≥ 90%                    |
| **Knowledge**     | knowledge_retrieval telemetry success rate   | ≥ 95%                    |
| **Memory**        | org_memory write success rate                | ≥ 99%                    |
| **Queue**         | BullMQ depth and processing rate             | Depth < 1000, Age < 5min |
| **Notifications** | notification_delivery telemetry success rate | ≥ 98%                    |
| **Runtime**       | p95 workstream latency                       | < 5000ms                 |
| **Status**        | Composite across all dimensions              | All green                |

---

## API

```
GET /api/v1/admin/runtime/health-matrix?windowMinutes=60
Authorization: x-admin-secret: <secret>

Response:
{
  "generatedAt": "2026-07-24T10:00:00Z",
  "windowMinutes": 60,
  "dependencies": {
    "overall": "healthy",
    "dependencies": [ ... ]
  },
  "runtime": {
    "p50LatencyMs": 340,
    "p95LatencyMs": 1200,
    "p99LatencyMs": 3100,
    "errorRate": 0.012,
    "throughputPerMinute": 8.4
  },
  "stages": [
    { "stage": "intent_detection",    "success_rate": "0.98", "avg_latency": "890" },
    { "stage": "knowledge_retrieval", "success_rate": "0.96", "avg_latency": "340" },
    ...
  ],
  "releaseGate": {
    "passed": true,
    "blockers": []
  }
}
```

---

## Release Gate Logic

The release gate **fails** when any of the following are true:

| Condition              | Threshold                     | Blocker Message                                 |
| ---------------------- | ----------------------------- | ----------------------------------------------- |
| Dependency unavailable | Any `unavailable` dependency  | `"Critical dependency unavailable"`             |
| Error rate             | `errorRate ≥ 5%`              | `"Error rate X% exceeds 5% threshold"`          |
| Stage success rate     | `successRate < 95%` per stage | `"Stage X success rate Y% below 95% threshold"` |

A successful build alone **never** qualifies a release. The health matrix must pass.

---

## CI/CD Integration

Add to the deployment pipeline after tests pass:

```bash
# Assert release gate before promoting to production
RESPONSE=$(curl -sf \
  -H "x-admin-secret: $PLATFORM_ADMIN_SECRET" \
  "$API_BASE_URL/api/v1/admin/runtime/health-matrix?windowMinutes=60")

PASSED=$(echo "$RESPONSE" | jq -r '.releaseGate.passed')
BLOCKERS=$(echo "$RESPONSE" | jq -r '.releaseGate.blockers[]')

if [ "$PASSED" != "true" ]; then
  echo "RELEASE GATE FAILED:"
  echo "$BLOCKERS"
  exit 1
fi
echo "Release gate passed ✅"
```
