# Galaxy Enterprise Governance

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

Enterprise Governance ensures that every autonomous decision the AOF makes is evaluated against the organization's full policy stack before execution. No autonomous action — regardless of confidence score or predicted benefit — may bypass this check.

Governance is not a single permission check. It is a six-step sequential evaluation that covers identity, RBAC, attribute-based policy, financial limits, regulatory compliance, and audit requirements. All six steps must pass. A failure at any step is a hard block.

---

## Governance Check Sequence

The `EnterpriseGovernanceEngine` runs the following checks in order. Each check receives the output of the previous check as context.

| Step | Name              | What It Checks                                                                     | Failure Outcome           |
| ---- | ----------------- | ---------------------------------------------------------------------------------- | ------------------------- |
| 1    | Identity          | Is the actor (agent or system) a known, active identity in this organization?      | Block — unknown actor     |
| 2    | Permission (RBAC) | Does the actor's role grant the requested action on the target resource type?      | Block — insufficient role |
| 3    | Policy (ABAC)     | Do the action's attributes satisfy all active attribute-based policies?            | Block — policy violation  |
| 4    | Financial Limit   | Does the action's estimated cost (USD or compute units) stay within the org's cap? | Block — over limit        |
| 5    | Compliance        | Does the action comply with regulatory rules (data residency, retention, consent)? | Block — compliance risk   |
| 6    | Audit Requirement | Has the audit infrastructure confirmed it can record this action before execution? | Block — audit gap         |

A block at any step short-circuits evaluation. Steps 5 and 6 are never skipped even when steps 3 and 4 pass.

---

## Non-Bypassable Governance Rules

The following rules are enforced at the database and middleware layer, not only by `EnterpriseGovernanceEngine`. Application code cannot override them:

1. **No autonomous write without a governance verdict.** The `AutomationGovernanceGuard` middleware rejects any write operation from an agent actor that lacks a `governanceVerdictId` in its request context.
2. **Financial limits are enforced at the database layer.** A database trigger on `aof_optimizations` rejects any row with `projected_savings_usd` that would push cumulative autonomous spend above `organization_policies.autonomous_spend_cap_usd`.
3. **Compliance check is never cached.** Regulatory rules can change between decisions. The compliance step always queries the current `organization_policies` snapshot.
4. **Audit infrastructure must confirm capacity before execution.** If the `audit_logs` insert for the pending action would fail (disk full, RLS violation, schema mismatch), the action is blocked at Step 6.

---

## Governance Verdict Schema

```typescript
interface GovernanceVerdict {
  verdictId: string; // UUID — stored in aof_decisions.governance_verdict
  approved: boolean;
  evaluatedAt: string; // ISO-8601
  checkedSteps: GovernanceStep[];
  blockers: GovernanceBlocker[]; // Empty when approved = true
  requiredApprovals: ApprovalRequirement[]; // Human approvals needed to proceed
  auditEntry: {
    logged: boolean;
    auditLogId: string;
  };
}

interface GovernanceBlocker {
  step: number; // 1–6
  stepName: string;
  reason: string;
  remediationHint: string; // How the block can be resolved
}

interface ApprovalRequirement {
  role: string; // e.g., 'finance_approver'
  reason: string;
  timeoutHours: number;
}
```

---

## Integration with AutomationGovernanceGuard

`AutomationGovernanceGuard` is the middleware component that enforces governance at the HTTP and job-queue layer. `EnterpriseGovernanceEngine` is the internal evaluation service it calls.

```typescript
// EnterpriseGovernanceEngine — required call pattern
const verdict = await EnterpriseGovernanceEngine.evaluate({
  organizationId,
  actor: { type: 'agent', id: agentId },
  action: {
    type: 'workflow.stage.modify',
    resourceId: stageId,
    estimatedCostUsd: 0.04,
    attributes: { dataResidency: 'eu-west-1', piiInvolved: false },
  },
  correlationId,
});

if (!verdict.approved) {
  await auditLogger.write({ eventType: 'aof.governance.blocked', ...verdict });
  throw new GovernanceBlockedError(verdict.blockers);
}
```

The `AutomationGovernanceGuard` middleware wraps this call. Do not call `EnterpriseGovernanceEngine` directly from route handlers — always go through the guard.

---

## Escalation Path When Governance Blocks Autonomous Action

When `approved: false` is returned:

1. The AOF Decision Engine sets `decision: 'escalate'` on the candidate.
2. An `aof.governance.blocked` GalaxyEvent is published with `verdict.blockers` in the payload.
3. If `requiredApprovals` is non-empty, an approval request is dispatched to the required roles via the Communication OS (WhatsApp notification).
4. The optimization remains in `Proposed` status until the approval is granted or the timeout expires.
5. If the approval timeout expires, the optimization is moved to `Rejected` and a `aof.optimization.rejected` event is emitted.
6. A governance block is never silently retried. A human must act on the escalation or the block must be remediated at the policy level.

---

## Governance Audit Requirements

Every governance evaluation — pass or fail — produces an audit entry:

```typescript
await auditLogger.write({
  eventType: 'aof.governance.evaluated',
  organizationId,
  actorType: 'system',
  actorId: 'enterprise-governance-engine',
  resourceId: verdictId,
  correlationId,
  payload: {
    approved: verdict.approved,
    blockers: verdict.blockers,
    requiredApprovals: verdict.requiredApprovals,
    stepsChecked: verdict.checkedSteps.length,
  },
});
```

Governance audit entries are INSERT-only (same RLS policy as `audit_logs`).

---

## Definition of Done

- [x] All 6 governance steps run on every autonomous write action without exception
- [x] `approved: false` always produces `decision: 'escalate'` in the AI Decision Engine
- [x] Financial limit check is enforced at database trigger level, not only application level
- [x] Compliance step is never served from cache
- [x] Every governance evaluation has a corresponding `aof.governance.evaluated` audit entry
- [x] Approval timeout path moves optimization to `Rejected` and emits the correct event
- [x] `AutomationGovernanceGuard` middleware test covers all 6 step failure scenarios
