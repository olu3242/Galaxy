# Phase 07: Agent OS

## Objectives

Implement the Agent OS module, which brings AI-powered automation to Galaxy. This phase delivers the AI agent runtime backed by Anthropic Claude, a registered tool catalog mapping agent capabilities to OS module operations, the AutomationGovernanceGuard enforcing the four-tier impact classification system, a human-in-the-loop approval flow for high-impact actions, and a complete audit trail for every agent decision. After this phase, organization members can instruct an AI agent via WhatsApp or the web dashboard to take actions on their behalf — safely, accountably, and with appropriate human oversight.

---

## Deliverables

### 1. Agent Runtime

- `AgentRuntimeService`: manages agent sessions using the Anthropic SDK (`claude-sonnet-4-6`)
- Session lifecycle:
  1. Member sends a message to the organization's WhatsApp number with a trigger phrase (or initiates via web dashboard)
  2. Communication OS routes the message to `agent-session` BullMQ queue
  3. `AgentRuntimeService` creates an `AgentSession` record and begins an Anthropic API conversation
  4. The agent processes the member's request, potentially calling multiple tools in sequence
  5. The session ends when the agent reaches a final response, the member ends the conversation, or a timeout occurs
- Agent sessions are stateful: `SessionMessage` records capture the full conversation history
- Context injection: the agent is provided with the member's profile, role, and relevant organizational context at session start
- Session timeout: 30 minutes of inactivity; member is notified and session is closed
- Database migration: `agent_sessions` table with RLS policy
- Emits: `agent.session.started`, `agent.session.ended`

### 2. Tool Registry

- `ToolRegistryService`: maintains the catalog of available agent tools
- Initial tool catalog:

| Tool                         | Description                                            | Impact Tier |
| ---------------------------- | ------------------------------------------------------ | ----------- |
| `list_my_tasks`              | List the current member's open tasks                   | 1           |
| `get_workflow_status`        | Get the status of a specific workflow run              | 1           |
| `search_knowledge`           | Semantic search over published knowledge documents     | 1           |
| `get_org_member`             | Look up a member's profile and contact info            | 1           |
| `complete_task`              | Mark a task as completed                               | 2           |
| `create_task`                | Create a new task for a specific member                | 2           |
| `add_task_comment`           | Add a comment to a task                                | 2           |
| `send_notification`          | Send a WhatsApp notification to a specific member      | 2           |
| `trigger_workflow`           | Trigger a specific workflow definition with input data | 3           |
| `send_bulk_notification`     | Send a notification to multiple members (>5)           | 3           |
| `update_department_settings` | Update a department's configuration                    | 3           |
| `grant_approval`             | Grant a pending approval on behalf of the member       | 3           |
| `delete_knowledge_document`  | Archive a knowledge document                           | 4           |
| `update_member_role`         | Change a member's role assignment                      | 4           |

- Tool input and output schemas are defined using Zod; validated before dispatch
- New tools can be registered without code changes to the runtime (schema-driven registration)
- `agent_actions` records are created for every tool invocation
- Emits: `agent.tool.invoked`, `agent.tool.failed`

### 3. AutomationGovernanceGuard

- `AutomationGovernanceGuard`: invoked by `ToolRegistryService` before every tool call
- Guard logic:
  1. Look up the tool's registered `impactTier`
  2. Tier 1: record `auto_approved` governance decision, proceed immediately
  3. Tier 2: record `auto_approved` governance decision, proceed immediately
  4. Tier 3: create `GovernanceApproval` record, suspend agent session, notify approver via WhatsApp
  5. Tier 4: create `GovernanceApproval` record with 24-hour window, suspend agent session, notify approver with full action description
- Guard bypass prevention: any tool call that does not go through the guard throws `ForbiddenError`
- Blocked actions: if a tool call is rejected by governance for a reason other than pending human approval (e.g., agent scope constraint violation), `agent.action.blocked` is emitted
- Database migration: `agent_actions` table, `governance_approvals` table with RLS policies
- Emits: `agent.action.proposed`, `agent.action.executed`, `agent.action.blocked`, `agent.governance.approval_requested`

### 4. Human-in-the-Loop Service

- `HumanInTheLoopService`: manages the approval workflow for Tier 3–4 agent actions
- Approval request WhatsApp message includes:
  - Plain-language description of the proposed action ("Your AI assistant wants to trigger the Leave Request workflow for Ahmed Al-Rashid")
  - The specific data the agent intends to use
  - Approve and Reject buttons (WhatsApp interactive message)
  - Expiry time of the approval window
- Approval response handling:
  - "APPROVE": `GovernanceApproval` status → `approved`; agent session resumes; `agent.governance.approved` emitted
  - "REJECT [reason]": status → `rejected`; agent session receives structured rejection; `agent.governance.rejected` emitted
  - Timeout: status → `expired`; agent session receives timeout result; `agent.action.blocked` emitted
- Fallback approver: configurable in `organizations.settings.agent_fallback_approver_id` — if the session initiator is unavailable, the fallback approver receives the request
- Concurrent approvals: an approver may have multiple pending approval requests (one per waiting agent action); each is tracked independently
- Emits: `agent.governance.approved`, `agent.governance.rejected`

### 5. Agent Audit Trail

- Every `AgentAction` record captures:
  - The tool invoked, input parameters, output, impact tier, governance outcome
  - Timestamps: `started_at`, `completed_at`, duration in milliseconds
  - Error message if the tool invocation failed
- Every `GovernanceApproval` captures the full approver decision including reason (for rejections)
- All agent events produce `agent` category audit log entries
- `GET /api/v1/agent-sessions` — list agent sessions for the requesting member or org (RBAC scoped)
- `GET /api/v1/agent-sessions/:id` — full session detail including messages and action log
- `GET /api/v1/agent-actions` — list agent actions (filterable by tool, impact tier, governance outcome)

### 6. Knowledge OS Integration

- Knowledge OS semantic search is exposed as an agent tool (`search_knowledge`)
- Document indexing: when a knowledge document is published, `DocumentIndexingService` generates embeddings using the Anthropic embeddings API and stores them in the pgvector extension
- Agent retrieval-augmented generation: the `search_knowledge` tool returns document excerpts with citations; the agent includes these in its response to the member

---

## Dependencies

- Phase 02 (Identity OS): member authentication, RBAC
- Phase 03 (People OS): org chart, member profiles (context injection)
- Phase 04 (Communication OS): WhatsApp message dispatch (for human-in-the-loop notifications and receiving approval responses)
- Phase 05 (Workflow OS): workflow trigger tool
- `ANTHROPIC_API_KEY` configured in AWS Secrets Manager
- pgvector extension enabled in PostgreSQL (migration)

---

## Acceptance Criteria

- [ ] Member sends "help me check my tasks" via WhatsApp; agent session starts and responds with the member's open task list
- [ ] Agent invokes `list_my_tasks` (Tier 1); action is auto-approved and executed without delay
- [ ] Agent invokes `create_task` (Tier 2); action is auto-approved and a task record is created
- [ ] Agent invokes `trigger_workflow` (Tier 3); approver receives a WhatsApp message with Approve/Reject buttons; approving continues the session; rejecting returns a rejection message to the member
- [ ] Tier 4 approval timeout: approval request expires after 24 hours; agent session receives timeout notification
- [ ] A tool invocation that bypasses the governance guard throws `ForbiddenError` (tested via unit test)
- [ ] `GET /api/v1/agent-sessions/:id` returns the complete session with all messages and action records
- [ ] Semantic search: after publishing a knowledge document, the agent can find it with a natural language query
- [ ] Cross-tenant isolation: agent session for Tenant A cannot invoke tools that access Tenant B's data
- [ ] All Agent OS domain events are emitted and produce `agent` category audit log entries
- [ ] Anthropic API timeout: agent session fails gracefully; member is notified via WhatsApp

---

## Risks

| Risk                                                                | Likelihood | Impact | Mitigation                                                                                                                           |
| ------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic API latency impacting WhatsApp UX                         | Medium     | Medium | Send "thinking..." acknowledgment immediately; agent response is delivered asynchronously                                            |
| Agent hallucination causing incorrect tool parameters               | Medium     | Medium | Zod schema validation on all tool inputs; Tier 2+ actions include a confirmation step in the agent's output message before execution |
| Human-in-the-loop approver unresponsive                             | Medium     | Low    | Fallback approver configuration; timeout with clear member notification                                                              |
| pgvector nearest-neighbor query performance at scale                | Low        | Low    | Index embeddings with IVFFlat or HNSW; limit search to published documents in tenant scope                                           |
| Anthropic API key exhaustion from uncontrolled agent session volume | Low        | Medium | Rate limiting at the `agent-session` queue level per tenant (max concurrent sessions per org)                                        |

---

## Success Metrics

| Metric                                            | Target                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Agent response latency (Tier 1 tool, no approval) | Under 10 seconds p95 end-to-end from WhatsApp send to WhatsApp response            |
| Tier 3 approval request delivery                  | Approver receives WhatsApp message within 30 seconds of agent proposing the action |
| Governance guard false-block rate                 | Zero (no legitimate Tier 1–2 actions blocked by governance guard)                  |
| Agent session audit log completeness              | 100% of agent sessions and actions have audit log entries                          |
| Knowledge search relevance (manual evaluation)    | Top-3 results contain the expected document in >80% of test queries                |
