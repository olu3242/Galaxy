# Galaxy Workflow Runtime Certification

**Version:** 1.0  
**Owner:** Workflow OS

---

## Purpose

Every workflow template in Galaxy must be certifiable through the full WRF lifecycle. Certification means the workflow has been verified to execute the complete 17-stage lifecycle, checkpoint correctly, recover from simulated failures, and produce an auditable result.

---

## Certification Checklist

For each workflow to be certified, verify:

| #   | Assertion                                   | Pass Condition                                               |
| --- | ------------------------------------------- | ------------------------------------------------------------ |
| 1   | **Event received**                          | `workstream_checkpoints.stage = 'event_received'` created    |
| 2   | **Intent detected**                         | `intent_detections` row with correct `detected_intent`       |
| 3   | **Workflow resolved**                       | `workflows` row exists for org; `workflow_runs` created      |
| 4   | **Checkpoint saved at workflow_resolution** | `workstream_checkpoints.stage = 'workflow_resolution'`       |
| 5   | **AI planning completes**                   | No stage telemetry error at `ai_planning`                    |
| 6   | **Task execution completes**                | `workflow_runs.status = 'running'` → `'completed'/'failed'`  |
| 7   | **Pause and resume**                        | Checkpoint can be restored after simulated crash             |
| 8   | **Retry succeeds**                          | Retryable stage retries up to 3x without manual intervention |
| 9   | **State restored after restart**            | `workstream_checkpoints` data matches pre-crash state        |
| 10  | **Audit generated**                         | `audit_logs` row with `action = 'workstream.completed'`      |
| 11  | **Telemetry emitted**                       | `workstream_telemetry` rows for every completed stage        |
| 12  | **Correlation IDs recorded**                | Every row shares the same `correlation_id`                   |
| 13  | **Memory persisted**                        | Outcome recorded in `org_memories` (if applicable)           |
| 14  | **DAG integrity**                           | All workflow graph nodes visited in correct order            |

---

## Certified Workflow Templates (Sprint 1)

| Workflow         | Channel  | States                                                                          | SLA | Certification Status |
| ---------------- | -------- | ------------------------------------------------------------------------------- | --- | -------------------- |
| Leave Request    | WhatsApp | submitted → pending_approval → approved/rejected → completed                    | 24h | ✅ Certified         |
| Expense Approval | WhatsApp | submitted → pending_approval → [finance_review →] approved/rejected → completed | 48h | ⏳ Sprint 2          |
| Incident Report  | WhatsApp | reported → under_investigation → resolved → closed                              | 4h  | ⏳ Sprint 2          |

---

## Leave Request Certification Trace

```
Event Received: WhatsApp message "I need leave from Monday"
    ↓
Identity Resolution: sender phone → users.id resolved
    ↓
Organisation Resolution: waba_phone_number_id → organizations.id
    ↓
Permission Validation: membership active, status = 'active'
    ↓
Intent Detection: detected_intent = 'leave_request' (confidence: 0.94)
    ↓
Workflow Resolution: workflow_definitions['Leave Request'] found
    Auto-instantiated: workflows row created for this org
    workflow_runs row created: { status: 'pending', senderPhone }
    ↓
Checkpoint saved: stage = 'workflow_resolution'
    ↓
AI Planning: approver identified (role = 'manager')
    ↓
Agent Assignment: (none — leave flow is direct approval, no agent DAG)
    ↓
Notification: Manager receives WhatsApp interactive button
    Approve | Reject
    ↓
Task Execution: Manager taps Approve
    approval-processing job: workflow_runs → 'completed'
    ↓
Notification: Member receives "Your leave request has been approved."
    ↓
Audit: audit_logs INSERT (action = workflow.completed)
    ↓
Learning: loop-processing job: create-loop
    ↓
Certification: all 12 WhatsApp assertions pass
```

---

## DAG Integrity Rules

A workflow DAG is valid when:

- Every state in `definition.states` is reachable from `initialState`
- Every transition has a defined `from` and `to` state
- No transition targets a state not in `definition.states`
- The DAG is acyclic (no infinite approval loops)
- At least one state is a terminal state (`completed`, `closed`, `failed`, `disbursed`)

---

## Release Gate Integration

The Workflow Runtime Certification is a mandatory input to `ENTERPRISE_RELEASE_GATE.md`. No release ships with an uncertified workflow if that workflow is in the active template catalog.

To add a new certified workflow:

1. Add template to `workflow_definitions` via `db:seed`
2. Implement processor logic in `apps/worker/src/processors/`
3. Write certification test in `apps/api/src/__tests__/workstream-certification.test.ts`
4. Verify health matrix passes at `GET /api/v1/admin/runtime/health-matrix`
