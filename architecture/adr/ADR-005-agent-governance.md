# ADR-005: Agent Governance Model

| Field                 | Value                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| **Status**            | Accepted                                                                                 |
| **Date**              | 2026-06-07                                                                               |
| **Review Date**       | Sprint 5                                                                                 |
| **Deciders**          | CTO, Platform Lead Engineer                                                              |
| **Related Documents** | `architecture/DOMAIN_MODEL.md` (Agent OS), `security/RBAC.md`, `security/AUDIT_MODEL.md` |

---

## Context

Galaxy's Agent OS enables AI agents (powered by Anthropic Claude) to perform actions on behalf of organization members. Agents can read data, create tasks, trigger workflows, send notifications, and in future versions, interact with external systems. This raises critical questions about safety, accountability, and trust:

1. **Write action risk:** Agents can make mistakes. An agent that misunderstands a member's intent could create incorrect tasks, trigger unintended workflows, or modify data in ways that are difficult to reverse. Unlike a human making a mistake, an agent can repeat mistakes at speed.

2. **Irreversibility:** Some actions are difficult or impossible to reverse. Sending a notification to all 500 organization members, triggering a payroll workflow, or deleting a knowledge document cannot be easily undone.

3. **Accountability gap:** In a traditional system, a human is accountable for every action. If an agent acts autonomously without human review, who is accountable for errors? The governance model must ensure a human is in the loop for high-impact actions.

4. **RBAC is necessary but insufficient:** Standard RBAC determines whether an action type is permitted for the agent's delegated scope. But RBAC does not account for the specific impact of a particular action instance — creating a task for one person is very different from triggering a company-wide workflow.

5. **Adoption risk:** If every agent action requires human approval, the agent is useless — it just creates more work than it saves. The governance model must allow agents to act autonomously for low-risk operations while reserving human judgment for high-impact ones.

6. **Auditability:** Every agent decision — including autonomous decisions — must be auditable. "The agent did it" is not a sufficient explanation for a compliance review.

---

## Decision

**We adopt a four-tier impact classification system for agent actions. Tiers 1–2 are automatically approved; Tiers 3–4 require explicit human approval before execution. The AutomationGovernanceGuard runs before every write action, and every governance decision is recorded in the audit log.**

### Impact Tier Classification

| Tier       | Classification              | Examples                                                                                                                                 | Governance                                           |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Tier 1** | Read-only                   | Fetch member list, query workflow status, search knowledge base                                                                          | Auto-approved                                        |
| **Tier 2** | Low-risk write              | Create a task for a specific member, add a comment, send a notification to one person                                                    | Auto-approved                                        |
| **Tier 3** | Significant write           | Trigger a workflow on behalf of a member, send notifications to multiple members (>5), update department settings                        | Requires human approval                              |
| **Tier 4** | Irreversible or high-impact | Delete a knowledge document, trigger a payroll-related workflow, modify RBAC role assignments, any action affecting more than 20 members | Requires human approval; 24-hour cancellation window |

### AutomationGovernanceGuard

The `AutomationGovernanceGuard` is invoked by the `ToolRegistryService` before dispatching any write tool call. The guard:

1. Looks up the tool's registered `impactTier` in the tool registry.
2. For Tier 1–2: Creates a `GovernanceDecision` record with outcome `auto_approved` and proceeds immediately.
3. For Tier 3–4: Creates a `GovernanceApproval` record, suspends the agent session, and notifies the appropriate human approver via WhatsApp.
4. The guard cannot be bypassed. Any tool call that does not pass through the guard fails with `ForbiddenError` at the registry layer.

### Human-in-the-Loop Flow (Tier 3–4)

1. The guard identifies the approver: the member who initiated the agent session, or a designated fallback approver defined in the organization's agent governance settings.
2. A WhatsApp message is sent to the approver with: a plain-language description of the proposed action, the impacted resources, and Approve/Reject response options.
3. The approver has a configurable timeout (default: 4 hours for Tier 3, 24 hours for Tier 4) to respond.
4. If approved: the action executes and the result is recorded.
5. If rejected: the action is blocked, and the agent session receives a structured rejection reason.
6. If timeout expires: the action is auto-blocked, the session is notified, and a new `governance.agent_action.blocked` event is emitted.

### Tool Impact Tier Registration

Every tool registered in the `ToolRegistryService` must declare its `impactTier`. This is set at tool registration time by the Platform Lead or Organization Owner. The tier assignment is reviewed as part of each sprint's security review.

---

## Consequences

### Positive

- **Autonomous operation for common cases:** Tier 1–2 actions (the majority of useful agent operations: fetching data, creating tasks, sending notifications to individuals) execute without human delay. The agent is genuinely useful for day-to-day operations.
- **Human control for high-impact cases:** Tier 3–4 actions that could cause significant disruption are reviewed by a human before execution. This aligns with the principle of keeping humans in control of consequential decisions.
- **Full audit trail:** Every governance decision — auto-approved or human-reviewed — is recorded in the audit log with the governance outcome and the actor. "Why did the agent do X?" can always be answered.
- **Risk proportionality:** The governance overhead is proportional to the action's potential impact. Low-risk, high-frequency operations are frictionless; high-impact, rare operations receive human attention.
- **Adaptable tier thresholds:** As organizations build trust with specific agent behaviors, tier thresholds can be adjusted by Organization Owners within bounds set by the Platform Admin.

### Negative

- **Human approval latency for Tier 3–4:** An agent session that triggers a Tier 3–4 action blocks until a human approves (or times out). This limits the agent's ability to chain multiple high-impact actions without human intervention.
- **Impact tier classification subjectivity:** Determining the correct tier for a tool requires judgment. A misclassified tool (Tier 3 action classified as Tier 2) could allow an auto-approved action that should have had human review. Mitigation: tier assignments are reviewed as a security artifact in each sprint.
- **WhatsApp approval UX friction:** For Tier 3–4 approvals, the approver must respond via WhatsApp. If the approver is unavailable, the session times out. Mitigation: configurable fallback approvers.
- **Complexity of agent session state management:** Suspending an agent session while awaiting human approval requires durable state management across the suspension window. BullMQ's job-state mechanism handles this, but it adds complexity to the agent session processor.

---

## Alternatives Considered

### No Governance (Reject Agent Write Actions Entirely)

**Approach:** Agents are read-only. They can query data and provide recommendations, but cannot take any write actions.

**Rejected because:** This severely limits the value proposition of the Agent OS. The primary use case is agents that can act — create tasks, trigger workflows, send notifications — not just observe. A read-only agent is useful for analytics but misses the productivity use cases that differentiate Galaxy.

### Allow-List Only

**Approach:** A static list of approved action patterns is maintained. Agents may only take actions that exactly match an item on the allow-list.

**Rejected because:** The allow-list approach is brittle and requires constant maintenance as new tools are added. It also cannot account for the context-specific impact of an action (sending a notification to 1 person vs. 500 people is the same action type but very different impact). The tier-based governance model is more principled and scales better as the tool registry grows.

### Post-Hoc Audit Only

**Approach:** Agents act autonomously with no upfront governance. All actions are logged and can be reviewed and reversed after the fact.

**Rejected because:** Post-hoc audit cannot prevent irreversible actions (Tier 4). By the time a human reviews a misconfigured agent action that sent notifications to 500 members or triggered an incorrect payroll workflow, the damage is done. The governance model must be preventive for high-impact actions, not just detective.

---

## Review Notes

At Sprint 5, this decision will be reviewed to assess:

1. Whether the Tier 3 approval timeout is appropriate (are approvers responding within the window?)
2. Whether any tools have been misclassified and caused governance incidents
3. Whether the WhatsApp-based approval UX is providing acceptable usability for approvers
4. Whether any organizations have requested custom tier thresholds for specific tools
5. Whether the Tier 4 24-hour cancellation window is being used or needs adjustment
