# Galaxy AI Decision Engine

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

The AI Decision Engine evaluates every optimization candidate produced by the AOF runtime loop before any action is taken. It answers a single question: given everything we know right now, should we execute this action, and how?

The engine is not a classifier. It reasons over eight input signals — urgency, business priority, SLA risk, estimated execution time, confidence score, organizational policies, available agents, and historical outcomes — and produces a structured decision object that downstream systems execute or defer.

---

## Input Signals

| Signal                  | Source                                        | Description                                                   |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Urgency score           | `aof_observations` recency + severity         | How time-sensitive is the optimization opportunity?           |
| Business priority       | `organization_policies.priority_matrix`       | Org-level weighting of workflow categories                    |
| SLA risk                | `aof_predictions.payload.slaBreachProb`       | Probability of SLA breach if action is not taken              |
| Estimated execution ms  | Historical median from `aof_learning_records` | Expected wall-clock cost of running this optimization         |
| Confidence score        | Predictive model output (0–1)                 | How certain is the engine that the outcome will be positive?  |
| Organizational policies | `organization_policies` table                 | Hard constraints: blackout windows, approval minimums, limits |
| Available agents        | `agent_os` health check at decision time      | Are the agents needed for execution currently healthy?        |
| Historical outcomes     | `aof_learning_records` for similar decisions  | Win/loss rate for this class of optimization                  |

---

## Decision Output Schema

```typescript
interface AofDecisionOutput {
  decisionId: string; // UUID
  decision: 'execute' | 'defer' | 'escalate' | 'reject';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: number; // 0.000 – 1.000
  executionStrategy: 'parallel' | 'sequential' | 'deferred';
  estimatedCompletionMs: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  rationale: string; // Human-readable explanation (required)
  governanceVerdict: GovernanceVerdict; // See ENTERPRISE_GOVERNANCE.md
  inputSignalSnapshot: Record<string, unknown>; // Snapshot of all 8 input signals at decision time
}
```

Decisions with `confidence < 0.6` must use `decision: 'escalate'` — they are never executed autonomously.

---

## Execution Strategy Rules

| Condition                                                  | Strategy     |
| ---------------------------------------------------------- | ------------ |
| Multiple independent optimizations, all `confidence ≥ 0.8` | `parallel`   |
| Optimizations have ordering dependencies                   | `sequential` |
| `slaBreachProb < 0.2` and no agent capacity right now      | `deferred`   |
| Any governance blocker present                             | `escalate`   |
| `riskLevel = 'critical'`                                   | `escalate`   |

---

## Integration with AutomationGovernanceGuard

The AI Decision Engine calls `AutomationGovernanceGuard.evaluate()` as a required step before producing any decision output. The guard runs the full six-step governance check (see `ENTERPRISE_GOVERNANCE.md`). If the guard returns `approved: false`, the decision output is forced to `decision: 'escalate'` regardless of confidence score.

```typescript
// Required invocation pattern — never bypassed
const verdict = await AutomationGovernanceGuard.evaluate({
  organizationId,
  actorType: 'agent',
  action: candidate.optimizationType,
  resourceId: candidate.targetWorkflowId,
  correlationId,
});

if (!verdict.approved) {
  return buildEscalateDecision(candidate, verdict, correlationId);
}
```

---

## Decision Audit Trail Requirements

Every decision must produce an immutable audit entry before the decision object is returned to the caller:

```typescript
await auditLogger.write({
  eventType: 'aof.decision.produced',
  organizationId,
  actorType: 'system',
  actorId: 'ai-decision-engine',
  resourceId: decisionId,
  correlationId,
  payload: {
    decision: output.decision,
    priority: output.priority,
    confidence: output.confidence,
    riskLevel: output.riskLevel,
    governanceVerdict: output.governanceVerdict,
  },
});
```

Decision audit entries are INSERT-only. The `aof_decisions` table enforces this with an RLS policy identical to `audit_logs`.

---

## `aof_decisions` Table Schema

```sql
CREATE TABLE aof_decisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL,
  decision              TEXT NOT NULL CHECK (decision IN ('execute', 'defer', 'escalate', 'reject')),
  priority              TEXT NOT NULL CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  confidence            NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  execution_strategy    TEXT NOT NULL CHECK (execution_strategy IN ('parallel', 'sequential', 'deferred')),
  estimated_completion_ms INTEGER NOT NULL,
  risk_level            TEXT NOT NULL CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
  rationale             TEXT NOT NULL,
  governance_verdict    JSONB NOT NULL DEFAULT '{}',
  input_signal_snapshot JSONB NOT NULL DEFAULT '{}',
  correlation_id        UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE aof_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY aof_decisions_tenant_isolation ON aof_decisions
  USING (organization_id = current_setting('app.current_tenant')::UUID);
```

---

## API

### Evaluate a Decision Candidate

```http
POST /api/v1/admin/aof/decision/evaluate
x-admin-secret: <secret>
Content-Type: application/json

{
  "optimizationType": "remove_approval_step",
  "targetWorkflowId": "wf_01HXYZ",
  "candidatePayload": { "stepId": "step_approval_manager" }
}
```

Response:

```json
{
  "decisionId": "dec_01HABC",
  "decision": "execute",
  "priority": "High",
  "confidence": 0.87,
  "executionStrategy": "sequential",
  "estimatedCompletionMs": 1200,
  "riskLevel": "low",
  "rationale": "Approval step has 0% rejection rate over 90 days; removal reduces median latency by 340ms.",
  "governanceVerdict": { "approved": true, "blockers": [], "requiredApprovals": [] }
}
```

### List Decisions

```http
GET /api/v1/admin/aof/decisions?priority=High&decision=escalate&limit=25
x-admin-secret: <secret>
```

---

## Definition of Done

- [x] All 8 input signals are populated before `evaluate()` is called
- [x] `confidence < 0.6` always produces `decision: 'escalate'`
- [x] `AutomationGovernanceGuard.evaluate()` is always called before producing output
- [x] Every decision produces an immutable audit entry
- [x] `aof_decisions` has RLS enabled and passes cross-tenant isolation test
