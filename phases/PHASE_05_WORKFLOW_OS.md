# Phase 05: Workflow OS

## Objectives

Implement the Workflow OS module, which is the operational core of Galaxy. Workflow OS enables organizations to define, publish, and execute multi-step business processes through WhatsApp. This phase delivers workflow definition management, live execution with a step-based state machine, task assignment and completion, approval flows with routing and delegation, and escalation handling. After this phase, an organization can run a complete workflow from WhatsApp trigger to final approval — entirely through WhatsApp.

---

## Deliverables

### 1. Workflow Definition Management

- `POST /api/v1/workflows` — create a workflow definition (status: `draft`)
- `GET /api/v1/workflows` — list definitions (filterable by status, with pagination)
- `GET /api/v1/workflows/:id` — get a definition with full step list
- `PATCH /api/v1/workflows/:id` — update a draft definition
- `POST /api/v1/workflows/:id/publish` — publish the definition (status: `active`); published definitions are immutable (new changes create a new version)
- `POST /api/v1/workflows/:id/archive` — archive a definition
- Database migrations: `workflows` table, `workflow_steps` table with RLS policies
- Supports step types: `task`, `approval`, `notification`, `branch`, `delay`
- Emits: `workflow.definition.created`, `workflow.definition.updated`, `workflow.definition.published`

### 2. Workflow Execution Engine

- `WorkflowExecutionEngine` domain service: advances a workflow run through its state machine
- State machine transitions: `running` → per-step execution → `completed` / `failed` / `cancelled`
- Execution is fully asynchronous: BullMQ `workflow-execution` queue processor
- Step completion triggers the engine to advance to the next step
- Branch step evaluation: condition expressions in step config determine which branch to follow
- Delay step: defers the next step execution by the configured duration using BullMQ's delayed job feature
- Workflow run context (`context` JSONB field): input data flows through steps; each step may add output data to context
- Database migrations: `workflow_runs` table, `workflow_run_steps` table with RLS policies
- Emits: `workflow.run.started`, `workflow.run.step_completed`, `workflow.run.completed`, `workflow.run.failed`, `workflow.run.cancelled`

### 3. Workflow Triggers

- `WorkflowTriggerService`: matches inbound conditions to workflow definitions
- Trigger types:
  - `whatsapp_message`: keyword match from Communication OS conversational flow engine
  - `api`: `POST /api/v1/workflows/:id/trigger` — directly initiates a run
  - `schedule`: cron expression in `trigger_config`; BullMQ cron job fires the trigger
- On trigger: creates a `WorkflowRun` record, enqueues the first step execution job
- Trigger validation: only `active` definitions can be triggered

### 4. Task Assignment and Management

- Task creation: when a `task` step executes, `TaskAssignmentService` creates a `Task` record and notifies the assignee via WhatsApp
- `TaskAssignmentService`: evaluates routing rules in the step config to determine the assignee (specific member, role-based, or manager of the initiator)
- Task completion: `PATCH /api/v1/tasks/:id/complete` — member marks task as complete
- Task completion via WhatsApp: member can reply to the task notification with "DONE" to complete the task
- `GET /api/v1/tasks` — list tasks for the requesting member (filterable by status, due date)
- `GET /api/v1/tasks/:id` — get task details
- Task overdue detection: a scheduled job checks for tasks past their `due_at` and emits `workflow.task.overdue`
- Database migration: `tasks` table with RLS policy
- Emits: `workflow.task.created`, `workflow.task.assigned`, `workflow.task.completed`, `workflow.task.overdue`

### 5. Approval Flows

- Approval creation: when an `approval` step executes, `ApprovalRoutingService` creates an `ApprovalRequest` and notifies designated approvers via WhatsApp
- Approver routing: resolved from step config (specific member, role within scope, manager of initiator)
- Quorum types: `any` (first approver to respond decides), `all` (unanimous), `majority`
- Approval response via WhatsApp: approver replies "APPROVE" or "REJECT [reason]"
- `PATCH /api/v1/approvals/:id/grant` and `PATCH /api/v1/approvals/:id/reject` — web dashboard equivalents
- Approval delegation: `POST /api/v1/approvals/:id/delegate` — approver delegates to another member
- Approval expiry: `expires_at` field triggers auto-expiry; expired approvals emit `workflow.approval.expired`
- `GET /api/v1/approvals` — list approval requests (filterable by status, scope)
- Database migration: `approvals` table, `approval_decisions` table with RLS policies
- Emits: `workflow.approval.requested`, `workflow.approval.granted`, `workflow.approval.rejected`, `workflow.approval.delegated`, `workflow.approval.expired`

### 6. Escalation Engine

- `EscalationService`: monitors overdue tasks and pending approvals against their escalation policies
- Escalation policies defined per workflow step: time-to-escalate duration and target (member above in reporting line, or a specific member)
- Escalation trigger: a scheduled BullMQ job runs every 15 minutes and checks for items requiring escalation
- On escalation: the escalation target is notified via WhatsApp; a `WorkflowRunStep.escalation_records` entry is written
- Escalations are chain-limited: a maximum of 3 escalation levels per step to prevent infinite escalation loops
- Emits: `workflow.escalation.triggered`

---

## Dependencies

- Phase 02 (Identity OS): member records, RBAC, JWT auth
- Phase 03 (People OS): org chart, reporting lines (required for manager routing and escalation)
- Phase 04 (Communication OS): WhatsApp notification dispatch, conversational keyword triggers
- `AuditWriterService` operational

---

## Acceptance Criteria

- [ ] `POST /api/v1/workflows` creates a draft definition with steps
- [ ] `POST /api/v1/workflows/:id/publish` makes the definition `active` and immutable (subsequent edit attempt returns 409)
- [ ] Triggering an active workflow via `POST /api/v1/workflows/:id/trigger` creates a `WorkflowRun` with status `running`
- [ ] A `task` step creates a `Task` record and sends a WhatsApp notification to the assignee
- [ ] Completing the task via WhatsApp reply ("DONE") advances the workflow run to the next step
- [ ] An `approval` step creates an `ApprovalRequest` and sends WhatsApp notifications to all designated approvers
- [ ] Approver replies "APPROVE" via WhatsApp and the approval is granted, workflow advances
- [ ] Approver replies "REJECT budget exceeded" via WhatsApp and the approval is rejected with reason "budget exceeded", workflow advances to the rejection branch
- [ ] Approval delegation: `POST /api/v1/approvals/:id/delegate` re-routes to the delegate and notifies them
- [ ] Approval expiry: after `expires_at`, approval status becomes `expired` and `workflow.approval.expired` is emitted
- [ ] Overdue task detection: a task past `due_at` has `workflow.task.overdue` emitted (test with a 1-minute due date in the test environment)
- [ ] Escalation: after the escalation timeout, the task or approval escalates to the configured target and a WhatsApp notification is sent
- [ ] Workflow run `completed` when all steps reach their terminal state
- [ ] Workflow run `failed` on an unrecoverable error; the run's actor is notified via WhatsApp
- [ ] Cross-tenant isolation test passes for all Workflow OS tables
- [ ] All Workflow OS domain events are emitted and produce audit log entries

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| State machine race condition: two concurrent step completions advance past a step simultaneously | Low | High | Use database row-level locking on `workflow_runs.current_step_id` during step advancement; BullMQ job concurrency limit of 1 per workflow run |
| Routing rule misconfiguration routes task to wrong member | Medium | Medium | Add routing rule dry-run validation in the workflow definition editor; log routing decisions |
| Escalation loop if manager chain has cycles | Low | Medium | Cycle detection in `OrgChartService.getReportingLine`; enforce maximum escalation depth of 3 |
| WhatsApp keyword collision (same keyword matches multiple workflows) | Low | Medium | Validate keyword uniqueness at workflow publish time; first-match-wins determinism if collision exists |
| Delay step: BullMQ delayed job precision | Low | Low | Document that delay steps have a minimum precision of the job processing interval (typically seconds) |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Workflow trigger to first step execution | Under 5 seconds p95 |
| Task completion to next step advancement | Under 3 seconds p95 |
| Approval response processing | Under 3 seconds p95 |
| End-to-end 3-step workflow (trigger → task → approval → complete) | Under 10 minutes for a manually executed test scenario |
| Audit log coverage | 100% of Workflow OS domain events produce audit log entries |
| Cross-tenant isolation | Passes for all Workflow OS tables |
