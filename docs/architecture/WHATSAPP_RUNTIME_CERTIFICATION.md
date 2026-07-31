# Galaxy WhatsApp Runtime Certification

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

This document certifies the complete execution path from a WhatsApp inbound message to a confirmed workflow outcome. Every stage must be verified with captured request/response, latency, dependency, agent, correlation ID, retry history, root cause, and resolution.

Galaxy never stops at: _"Unable to process request."_ Every failure identifies the precise failing stage.

---

## Certified Execution Trace

```
WhatsApp Message
      │  inbound webhook POST /api/v1/webhooks/whatsapp
      │  Meta HMAC-SHA256 signature verified
      ▼
Webhook Handler
      │  phoneNumberId extracted
      │  normalised to NormalizedInboundMessage
      │  routed to intent-detection queue
      ▼
Identity Resolution
      │  organizations.waba_phone_number_id lookup
      │  actorId resolved from users.whatsapp_phone
      ▼
Organisation Resolution
      │  app.current_tenant set via set_config(false) on dedicated PoolClient
      │  tenant isolation enforced (FORCE ROW LEVEL SECURITY)
      ▼
Intent Detection (Claude Haiku)
      │  raw_input → classification JSON
      │  detected_intent: leave_request | expense_request | incident_report | …
      │  confidence_score persisted to intent_detections
      ▼
Workflow Resolution
      │  SELECT id FROM workflow_definitions WHERE name = 'Leave Request'
      │  Auto-instantiate: INSERT INTO workflows (org-scoped copy)
      │  CREATE workflow_runs row with trigger_data.senderPhone
      ▼
AI Planning
      │  workflow DAG constructed
      │  approvers resolved from memberships + roles
      ▼
Agent Assignment
      │  Agent OS assigns execution agents to DAG nodes
      ▼
WhatsApp Notification — Manager Approval Request
      │  Interactive button message to manager.whatsapp_phone
      │  Buttons: { id: "approve:<runId>" } | { id: "reject:<runId>" }
      ▼
Approval Processing (manager taps button)
      │  Button reply parsed by webhook handler
      │  Enqueued to approval-processing queue
      │  workflow_runs.status → completed | failed
      ▼
WhatsApp Notification — Member Outcome
      │  "Your leave request has been approved." → member.whatsapp_phone
      ▼
Audit Logging
      │  audit_logs INSERT: actor_type=member, action=workflow.completed
      │  correlation_id threaded from webhook to audit row
      ▼
Loop OS — Verification Trigger
      │  loop-processing queue enqueued: create-loop job
      │  Manager confirmation requested via WhatsApp
      ▼
Learning Engine
      │  Loop feedback → knowledge improvement
      │  Failure patterns → self-healing rules
      ▼
Certification
      │  WRF assertions: DAG integrity, checkpoint recovery, audit present
```

---

## Stage Capture Requirements

For every stage, the following must be capturable from `workstream_telemetry`:

| Field            | Presence                          |
| ---------------- | --------------------------------- |
| `stage`          | Required                          |
| `duration_ms`    | Required                          |
| `success`        | Required                          |
| `error_code`     | Required if failed                |
| `dependency`     | Required if dependency failed     |
| `agent_id`       | Required if agent was involved    |
| `retry_count`    | Required                          |
| `correlation_id` | Required (threads the full trace) |

---

## Certification Assertions

The following must all pass for the WhatsApp runtime to be considered certified:

| #   | Assertion                                                            |
| --- | -------------------------------------------------------------------- |
| 1   | Inbound webhook signature validated with HMAC-SHA256 (never skipped) |
| 2   | `app.current_tenant` set before first RLS-gated query                |
| 3   | `intent_detections` row created with `confidence_score`              |
| 4   | `workflow_runs` row created with `trigger_data.senderPhone`          |
| 5   | Manager receives interactive WhatsApp button message                 |
| 6   | Approval button triggers `approval-processing` job                   |
| 7   | `workflow_runs.status` transitions to `completed` or `failed`        |
| 8   | Member receives outcome notification via WhatsApp                    |
| 9   | `audit_logs` row created with matching `correlation_id`              |
| 10  | Loop verification job enqueued after approval                        |
| 11  | All `workstream_telemetry` rows present for the execution            |
| 12  | Zero cross-tenant data leaks (RLS isolation test)                    |

---

## Known Limitations

| Limitation                                   | Mitigation                                                           |
| -------------------------------------------- | -------------------------------------------------------------------- |
| AI coordinator uses Anthropic API (external) | Retried up to 3x; fallback: `other` intent with human review flag    |
| WhatsApp API rate limits                     | Outbound failures are non-fatal and logged in telemetry              |
| Manager must have `whatsapp_phone` set       | Warning emitted; workflow continues without manager notification     |
| `workflow_definitions` must be seeded        | `db:seed` populates Leave Request, Expense Approval, Incident Report |
