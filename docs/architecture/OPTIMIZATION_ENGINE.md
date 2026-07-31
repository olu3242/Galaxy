# Galaxy Optimization Engine

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

The Optimization Engine continuously analyzes completed workflow executions and produces ranked improvement recommendations. It is the component in the AOF runtime loop responsible for Steps 3 (Pattern Detection), 8 (Autonomous Execution), 9 (Outcome Verification), and 10 (Learning Integration).

Recommendations are never applied automatically the first time they appear. Every recommendation must pass through the AI Decision Engine, Digital Twin simulation (if risk level warrants it), and Certification before being marked `Applied`.

---

## Optimization Types

| Type                      | Description                                                              | Typical Latency Saving |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `remove_approval_step`    | Approval step with 0% rejection rate over a configurable window          | 200–800ms per run      |
| `parallelize_stages`      | Two sequential stages with no data dependency are run concurrently       | Up to 50% of stage sum |
| `merge_duplicate_actions` | Identical API calls made in multiple stages are deduplicated             | 100–400ms per run      |
| `reduce_latency`          | Stage consistently exceeds p75 threshold; prompt or timeout optimization | Variable               |
| `improve_ai_prompt`       | LLM stage has high retry rate; prompt rewrite to reduce failure rate     | 10–40% retry reduction |
| `optimize_resource_alloc` | Agent pool is undersized during peak hours; scale recommendation         | Queue wait time        |
| `reorder_stages`          | Expensive stage runs before a fast filter that would discard most inputs | 30–70% cost reduction  |
| `cache_repeated_lookups`  | Identical knowledge base queries made per-run; result is cacheable       | 50–200ms per run       |

---

## Optimization Lifecycle

Every optimization candidate moves through the following states in order. No state may be skipped.

| State       | Entered When                                                          | Who Transitions      |
| ----------- | --------------------------------------------------------------------- | -------------------- |
| `Detected`  | Pattern analysis identifies a candidate                               | Optimization Engine  |
| `Proposed`  | AI Decision Engine produces `decision: 'execute'`                     | AI Decision Engine   |
| `Certified` | Certification checklist passes (see `AUTONOMOUS_CERTIFICATION.md`)    | Certification Engine |
| `Staged`    | Certified optimization is queued in BullMQ for application            | Certification Engine |
| `Applied`   | Worker successfully applies the optimization to the workflow template | Worker               |
| `Verified`  | Post-application metrics match or exceed projections                  | Optimization Engine  |
| `Learning`  | Delta written to `aof_learning_records`; model weights updated        | Learning Integrator  |

If any step fails, the optimization moves to `Rejected` and a `aof.optimization.rejected` event is emitted. Rejected optimizations are never retried automatically; a human review is required.

---

## `aof_optimizations` Table Schema

```sql
CREATE TABLE aof_optimizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  optimization_type   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Detected' CHECK (
    status IN ('Detected', 'Proposed', 'Certified', 'Staged', 'Applied', 'Verified', 'Learning', 'Rejected')
  ),
  target_workflow_id  UUID,
  target_stage_id     UUID,
  before_metrics      JSONB NOT NULL DEFAULT '{}',
  after_metrics       JSONB NOT NULL DEFAULT '{}',
  projected_savings   JSONB NOT NULL DEFAULT '{}',
  certification_id    UUID REFERENCES aof_certifications(id),
  decision_id         UUID REFERENCES aof_decisions(id),
  applied_at          TIMESTAMPTZ,
  verified_at         TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE aof_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY aof_optimizations_tenant_isolation ON aof_optimizations
  USING (organization_id = current_setting('app.current_tenant')::UUID);
```

---

## API

### Main Enterprise Optimization Endpoint

```http
GET /api/v1/admin/optimization
x-admin-secret: <secret>
```

This is the primary entry point for clients consuming AOF outputs. It returns a consolidated view of the current optimization state for the organization.

Response:

```json
{
  "organizationId": "org_01HABC",
  "generatedAt": "2026-07-24T10:00:00Z",
  "optimizationScore": 82,
  "costSavings": {
    "appliedUsd": 4210,
    "projectedUsd": 11840,
    "currency": "USD"
  },
  "recommendations": [
    {
      "id": "opt_01HXYZ",
      "type": "remove_approval_step",
      "status": "Proposed",
      "priority": "High",
      "confidence": 0.91,
      "description": "Manager approval on 'Vendor Onboarding' has 0% rejection rate over 90 days.",
      "projectedSavingsMs": 340,
      "projectedSavingsUsd": 180
    }
  ],
  "predictions": [
    {
      "type": "sla_breach_risk",
      "workflowId": "wf_01HABC",
      "probability": 0.23,
      "horizonHours": 48,
      "mitigationAvailable": true
    }
  ],
  "workflowImprovements": [
    {
      "workflowId": "wf_01HXYZ",
      "name": "Vendor Onboarding",
      "currentMedianMs": 14200,
      "projectedMedianMs": 8900,
      "improvementPct": 37.3
    }
  ],
  "agentPerformance": {
    "averageSuccessRate": 0.96,
    "averageLatencyMs": 1240,
    "underperformingAgents": []
  }
}
```

---

## Verification Criteria

After an optimization is applied (`status: 'Applied'`), the engine waits for a configurable observation window (default: 7 days or 50 runs, whichever comes first) before evaluating verification.

Verification passes when:

1. Actual median latency ≤ projected median latency + 10% tolerance
2. Error rate has not increased by more than 1 percentage point
3. SLA compliance has not decreased

If verification fails, the optimization's rollback plan is executed automatically (see `AUTONOMOUS_CERTIFICATION.md`).

---

## Definition of Done

- [x] All 8 optimization types are implemented with detection logic and unit tests
- [x] No optimization reaches `Applied` without a `certification_id` reference
- [x] Verification window is configurable per organization via `organization_policies`
- [x] Failed verification triggers automatic rollback within one BullMQ job cycle
- [x] `aof_optimizations` status transitions are append-only in audit trail
- [x] `/api/v1/admin/optimization` response always includes `optimizationScore`, `costSavings`, `recommendations`, `predictions`, `workflowImprovements`, and `agentPerformance`
