# Galaxy Autonomous Certification

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

Autonomous Certification is the quality gate between a proposed optimization and its application to a live workflow. No optimization may be applied autonomously unless it holds a certification record in `aof_certifications` with `status: 'Certified'`.

Certification exists because confidence score and governance approval are necessary but not sufficient. An optimization can be high-confidence, governance-approved, and still introduce a subtle correctness defect or break tenant isolation in a non-obvious way. The certification checklist is the last line of defense.

---

## Certification Checklist

Every certification evaluation runs the following checks in order. All checks must pass. A single failure sets `status: 'Rejected'`.

| #   | Check               | Pass Criterion                                                                                  |
| --- | ------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Correctness         | Optimization produces valid workflow DAG with no unreachable stages and no circular deps        |
| 2   | Security            | No new string interpolation in SQL paths; no secrets exposed; HMAC paths unaffected             |
| 3   | Compliance          | Optimization does not shorten retention windows or remove consent checkpoints                   |
| 4   | Performance         | Digital Twin simulation confirms projected improvement (not degradation) within 10% tolerance   |
| 5   | Tenant Isolation    | Modified workflow template cannot read or write across `organization_id` boundaries             |
| 6   | Auditability        | Every new action path created by the optimization emits a `GalaxyEvent` and writes to audit log |
| 7   | Rollback Capability | A complete, tested rollback plan exists and passes dry-run validation                           |

Checks 1–4 are automated. Checks 5–7 require both automated tests and a cryptographic hash of the pre-change state stored in `aof_certifications.pre_change_hash`.

---

## Rollback Guarantee

Every certified optimization includes a rollback plan that is stored at certification time and can be executed without any additional analysis:

```typescript
interface RollbackPlan {
  planId: string; // UUID
  certificationId: string;
  steps: RollbackStep[]; // Ordered; executed in reverse on rollback
  preChangeHash: string; // SHA-256 of workflow template state before optimization
  estimatedRollbackMs: number;
  testedAt: string; // ISO-8601; dry-run timestamp
}

interface RollbackStep {
  order: number;
  action: 'restore_stage' | 'delete_stage' | 'update_policy' | 'restore_prompt';
  targetId: string;
  payload: Record<string, unknown>;
}
```

Rollback is triggered automatically when:

- Verification of an `Applied` optimization fails (see `OPTIMIZATION_ENGINE.md`)
- A human operator calls `POST /api/v1/admin/aof/certifications/:id/rollback`

Rollback execution emits `aof.optimization.rolledback` and writes to `audit_logs`. A rolled-back optimization is permanently marked `Rejected` — it does not re-enter the detection cycle.

---

## Certification Lifecycle

```
Proposed → Under Review → Certified
                       → Rejected
```

| Transition               | Trigger                                                |
| ------------------------ | ------------------------------------------------------ |
| Proposed → Under Review  | Certification job picked up by worker                  |
| Under Review → Certified | All 7 checklist items pass                             |
| Under Review → Rejected  | Any checklist item fails, or reviewer manually rejects |

Certifications never move backward. A `Rejected` certification cannot be reopened. If the underlying issue is fixed, a new optimization candidate must be created and go through the full lifecycle from `Detected`.

---

## `aof_certifications` Table Schema

```sql
CREATE TABLE aof_certifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  optimization_id     UUID NOT NULL REFERENCES aof_optimizations(id),
  status              TEXT NOT NULL DEFAULT 'Proposed' CHECK (
    status IN ('Proposed', 'Under Review', 'Certified', 'Rejected')
  ),
  checklist           JSONB NOT NULL DEFAULT '{}',
  -- checklist shape: { correctness: bool, security: bool, compliance: bool,
  --                    performance: bool, tenantIsolation: bool,
  --                    auditability: bool, rollbackCapability: bool }
  rollback_plan       JSONB NOT NULL DEFAULT '{}',
  pre_change_hash     TEXT,           -- SHA-256 of pre-optimization state
  reviewer_id         UUID,           -- NULL for automated certification; member UUID for manual
  review_notes        TEXT,
  decided_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE aof_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY aof_certifications_tenant_isolation ON aof_certifications
  USING (organization_id = current_setting('app.current_tenant')::UUID);
```

---

## API

### Submit Optimization for Certification

```http
POST /api/v1/admin/aof/certifications
x-admin-secret: <secret>
Content-Type: application/json

{
  "optimizationId": "opt_01HXYZ"
}
```

Response:

```json
{
  "certificationId": "cert_01HABC",
  "optimizationId": "opt_01HXYZ",
  "status": "Under Review",
  "estimatedCompletionMs": 8000
}
```

Certification runs asynchronously. Subscribe to `aof.certification.decided` for the outcome.

### Fetch Certification Record

```http
GET /api/v1/admin/aof/certifications/cert_01HABC
x-admin-secret: <secret>
```

Response (certified):

```json
{
  "certificationId": "cert_01HABC",
  "status": "Certified",
  "checklist": {
    "correctness": true,
    "security": true,
    "compliance": true,
    "performance": true,
    "tenantIsolation": true,
    "auditability": true,
    "rollbackCapability": true
  },
  "preChangeHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "decidedAt": "2026-07-24T10:04:22Z"
}
```

### Trigger Manual Rollback

```http
POST /api/v1/admin/aof/certifications/cert_01HABC/rollback
x-admin-secret: <secret>
Content-Type: application/json

{
  "reason": "Regression observed in p99 latency post-application"
}
```

---

## Definition of Done

- [x] All 7 checklist items are evaluated for every certification; no item can be skipped programmatically
- [x] `preChangeHash` is stored before any modification is made
- [x] Rollback plan dry-run passes before `status: 'Certified'` is written
- [x] Automatic rollback triggers within one job cycle of a failed verification
- [x] `aof.certification.decided` event is emitted on every status transition to `Certified` or `Rejected`
- [x] `aof_certifications` has RLS enabled and passes cross-tenant isolation test
- [x] A `Rejected` certification cannot be transitioned to any other status
