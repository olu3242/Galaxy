# ADR-005: AI Agent Runtime — Anthropic Claude API with Mandatory Human-in-the-Loop for Write Actions

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Engineering Foundation
**Tags:** ai, agents, safety, architecture

---

## Context

Galaxy's Agent OS specifies 7 AI agents (Executive, HR, Finance, Operations, Compliance, Knowledge, Communications) that autonomously analyze data and take actions on behalf of organizations. Some actions are read-only (generate a report, search documents). Others are write actions with real business consequences: auto-rejecting expense claims, pausing active workflows, updating budget records, flagging members.

The platform must determine which agent actions can execute autonomously and which require human confirmation before execution.

## Decision

All AI agent write actions are classified by **impact tier**. Tier 2 and Tier 3 actions require human confirmation before execution. The `AutomationGovernanceGuard` enforces this at the agent framework level — individual agent implementations cannot bypass it.

**Impact Tiers:**

| Tier | Description | Examples | Execution |
|---|---|---|---|
| Tier 1 — Read | Read data, generate output, send notifications | Executive briefing, search, analysis report | Autonomous |
| Tier 2 — Soft Write | Create records, send messages, create tasks | Create follow-up task, send reminder, log observation | Autonomous with audit trail |
| Tier 3 — Hard Write | Modify existing records, pause/reject operations, flag for review | Auto-reject expense, pause workflow, flag member | **Human confirmation required** |
| Tier 4 — Irreversible | Delete records, archive data, trigger financial operations | Archive member, process payment, delete document | **Human confirmation + 2nd factor** |

**Exception:** An agent may execute a Tier 3 action without human confirmation ONLY if:
1. The action has been explicitly pre-authorized by an admin for a specific pattern (e.g., "auto-reject duplicate invoices with > 95% confidence"), AND
2. The confidence score meets or exceeds the pre-authorized threshold, AND
3. The action is reversible within 24 hours with full audit trail

## Rationale

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| Full autonomy — agents act on all LLM decisions | Fast, no friction | LLM hallucinations cause irreversible business damage; no user trust in early product |
| Human confirmation for all actions | Safest | Eliminates the value proposition of AI agents entirely |
| Impact-tier gating | Balances automation vs. safety; builds trust incrementally | Requires careful tier classification; more complex implementation |

### Chosen Option: Impact-Tier Gating

The Finance Agent (auto-rejecting expenses) and Compliance Agent (pausing workflows) are the highest-risk agents. Until the platform has validated these agents' accuracy on real organizational data, autonomous Tier 3 execution is not safe. The impact-tier model allows automation to expand as confidence is established.

## Consequences

### Positive
- Organizations can trust the agents won't make irreversible mistakes autonomously
- Trust is built incrementally as human confirmation provides feedback data
- Clear classification makes it easy to audit what the agents did and why

### Negative / Trade-offs
- Tier 3 actions require a human in the loop — reduces automation speed
- Human confirmation flow must be designed and built (WhatsApp confirmation messages)
- Higher implementation complexity in the agent framework

## Implementation Notes

### AutomationGovernanceGuard

Every agent action passes through this guard before execution:

```typescript
interface AutomationGovernanceGuard {
  validate(action: AgentAction): Promise<GovernanceResult>;
}

interface GovernanceResult {
  approved: boolean;
  requiresHumanConfirmation: boolean;
  impactTier: 1 | 2 | 3 | 4;
  reason: string;
  confirmationRequestId?: string;
}
```

### Agent Context Requirements

Every agent invocation must include:
- `tenantId` — scopes all tool access
- `correlationId` — traces the entire agent decision chain
- `actor` — `{ type: 'agent', id: agentType }`
- `permissions` — what the agent is allowed to do in this context

Agents may only use tools that are in their granted permission set.

### Audit Requirements

Every agent action (including read actions) produces an `audit_logs` entry with:
- `actor_type = 'agent'`
- `actor_id = agentType`
- `action = 'agent.action.{type}'`
- `new_value` = the action taken and its inputs
- `correlation_id` linking the full decision chain

### Human Confirmation Flow (Tier 3)

```
Agent proposes Tier 3 action
    ↓
GovernanceGuard creates PendingConfirmation record
    ↓
WhatsApp message sent to authorized admin:
  "Galaxy Finance Agent wants to auto-reject expense #EXP-123
   ($1,450 — duplicate of EXP-118). Reply YES to approve or NO to reject."
    ↓
Admin responds YES/NO via WhatsApp
    ↓
Action executes (YES) or is cancelled (NO)
    ↓
Both outcomes written to audit_logs
```

## Review Trigger

Revisit after each agent accumulates 1,000+ decisions. Agents with > 98% human-confirmed accuracy on Tier 3 actions for 90 consecutive days may be considered for auto-approval pre-authorization.
