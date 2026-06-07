# Phase 06: Analytics OS

## Objectives

Implement the Analytics OS module and the Loop Engine, which transform Galaxy's event stream into actionable organizational intelligence. This phase delivers workflow performance metrics, SLA monitoring, executive dashboards, the Loop Engine pattern detection system, and scheduled report generation. After this phase, executives and managers have data-driven visibility into organizational performance, and the Loop Engine begins surfacing improvement opportunities automatically.

---

## Deliverables

### 1. Event Stream Aggregation

- `analytics-aggregation` BullMQ queue processor: consumes `GalaxyEvent` instances and routes them to appropriate metric computation functions
- `MetricAggregationService`: computes metric snapshots from events and stores in `metric_snapshots` table
- Metrics computed per event:
  - `workflow.run.completed` → `workflow_completion_rate`, `avg_workflow_duration`
  - `workflow.task.completed` → `avg_task_duration`
  - `workflow.task.overdue` → `task_overdue_count`
  - `workflow.approval.granted` / `workflow.approval.rejected` → `approval_turnaround_time`, `approval_grant_rate`
  - `workflow.escalation.triggered` → `escalation_rate`
  - `agent.action.executed` → `agent_action_count` per tool
- Dimensions: per-organization, per-department, per-workflow-definition, per-member
- Time windows: daily, weekly, monthly rolling aggregates
- Database migration: `metric_snapshots` table with RLS policy

### 2. SLA Monitoring

- `SlaMonitoringService`: runs on a configurable schedule (default: every 5 minutes)
- SLA thresholds configurable per workflow definition in `workflow.trigger_config`
- Detects:
  - Tasks past `due_at` with no completion: `analytics.sla.breached` emitted with resource type `task`
  - Approval requests pending beyond the configured SLA: `analytics.sla.breached` with resource type `approval`
  - Workflow runs running longer than their defined maximum duration: `analytics.sla.breached` with resource type `workflow_run`
- On SLA breach: `analytics.sla.breached` event emitted; `governance.policy.enforced` triggered if a governance policy matches
- SLA breach events recorded in audit log

### 3. Analytics API

- `GET /api/v1/analytics/overview` — org-level summary: active workflow count, open task count, pending approval count, completion rate this week
- `GET /api/v1/analytics/workflows` — per-workflow-definition metrics: run count, avg duration, completion rate, failure rate
- `GET /api/v1/analytics/workflows/:id` — single workflow definition detailed metrics with time-series data
- `GET /api/v1/analytics/members` — per-member metrics: tasks completed, tasks overdue, approvals granted, response time (scoped by requester's role)
- `GET /api/v1/analytics/departments` — per-department metrics: headcount, workflow completion rate, task SLA rate
- All analytics endpoints respect RBAC scoping: Executives see org-wide data; Department Heads see their department only; Managers see their department only
- Query parameter: `period` (last_7_days, last_30_days, last_90_days, custom range with `from` and `to`)

### 4. Executive Dashboard API

- `GET /api/v1/dashboard` — returns a pre-aggregated snapshot for the executive/owner dashboard widget set
- Dashboard data includes:
  - Workflow completion rate (this period vs. previous period with trend direction)
  - Top 5 workflows by run volume
  - Average approval turnaround time
  - Top 5 members by tasks completed
  - SLA breach count (this period)
  - Open Loop Engine insights count
- Dashboard data is cached in Redis (TTL: 5 minutes) to minimize per-request query load
- WebSocket push: dashboard subscribers receive a push notification when an SLA breach or Loop Engine insight is recorded

### 5. Loop Engine

- `LoopEngineService`: scheduled job runs daily (configurable; defaults to 02:00 UTC)
- Pattern detection algorithms (initial set):
  - **Bottleneck detection:** Workflow steps with avg duration > 2x the org-wide average for that step type
  - **Escalation hot spot:** Members or departments with escalation rate > 20% over the past 30 days
  - **Approval backlog:** Members who are designated approvers with >10 pending approvals open simultaneously
  - **Workflow abandonment:** Workflow definitions with >30% cancellation rate
  - **Overdue cluster:** Departments with task overdue rate >25%
- Each detected pattern creates an `AiInsight` record with type, title, description, recommendation, and severity
- Insights are surfaced in the web dashboard under "Loop Insights"
- `PATCH /api/v1/insights/:id` — mark an insight as acknowledged, acted upon, or dismissed
- Emits: `analytics.metric.snapshot_recorded`, `governance.loop_insight.created`, `governance.loop_insight.acted_upon`
- Database migration: `ai_insights` table with RLS policy

### 6. Report Generation

- `ReportGenerationService`: builds structured reports from metric snapshots
- `POST /api/v1/reports` — generate a report for a given scope and period (async: returns a job ID)
- `GET /api/v1/reports/:id` — check report status and download URL when complete
- Report types: workflow performance, member performance, department overview, SLA compliance
- Report formats: JSON (API-native), CSV (downloadable)
- Reports are generated as BullMQ jobs; output stored in S3; download URL signed with 1-hour TTL
- Emits: `analytics.report.generated`

---

## Dependencies

- Phase 05 (Workflow OS): workflow run events, task events, approval events are the primary data source
- Phase 02 (Identity OS): member data, RBAC scoping for analytics queries
- Phase 03 (People OS): department and team hierarchy for scoped analytics
- Phase 04 (Communication OS): message volume metrics (optional for this phase)
- `GalaxyEvent` stream fully operational
- S3 bucket configured for report storage

---

## Acceptance Criteria

- [ ] After 5 workflow runs complete in the test organization, `GET /api/v1/analytics/workflows` returns metrics including run count and avg duration
- [ ] SLA breach detection: creating a task with a `due_at` in the past and running the SLA monitoring job emits `analytics.sla.breached`
- [ ] Executive Dashboard endpoint returns all widget data within 200ms (cached path)
- [ ] RBAC scoping: a Department Head for Department A gets only Department A's data from `GET /api/v1/analytics/departments`
- [ ] Loop Engine bottleneck detection: seeding a workflow where step B takes 5x longer than step A causes a bottleneck insight to be created for step B
- [ ] `GET /api/v1/insights` returns the created bottleneck insight with status `new`
- [ ] Marking an insight as `acknowledged` changes its status and emits `governance.loop_insight.acted_upon`
- [ ] `POST /api/v1/reports` creates a report job; `GET /api/v1/reports/:id` returns a download URL when complete
- [ ] Report CSV download contains correct data for the requested scope and period
- [ ] Cross-tenant isolation: `GET /api/v1/analytics/overview` for Tenant A returns only Tenant A's metrics (zero Tenant B data)
- [ ] All Analytics OS domain events are emitted and produce audit log entries

---

## Risks

| Risk                                                       | Likelihood | Impact | Mitigation                                                                                                        |
| ---------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| Analytics aggregation lag if event queue is large          | Medium     | Low    | Use a dedicated high-concurrency analytics queue; dashboard data is eventually consistent by design               |
| Loop Engine false-positive insights causing noise          | Medium     | Low    | Tune thresholds conservatively; provide dismiss functionality; note that insights are recommendations not actions |
| Metric snapshot table growing large over time              | Medium     | Medium | Partition the table by month; add a data retention policy (delete snapshots >2 years old)                         |
| Report generation for large date ranges timing out         | Low        | Medium | Enforce a maximum report date range of 90 days; use streaming CSV generation for large reports                    |
| Dashboard cache serving stale data after a data correction | Low        | Low    | Cache TTL of 5 minutes is acceptable for dashboard data; provide a manual cache-invalidation endpoint for admins  |

---

## Success Metrics

| Metric                       | Target                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Analytics API response time  | Under 200ms p95 for pre-aggregated endpoints                                       |
| Loop Engine run time         | Under 5 minutes for an organization with 1000 workflow runs in the analysis window |
| SLA breach detection latency | Within 1 monitoring cycle (5 minutes) of the SLA breach occurring                  |
| Report generation time       | Under 60 seconds for a 30-day report covering up to 500 workflow runs              |
| Dashboard cache hit rate     | Greater than 90% (cache TTL 5 minutes; most dashboards are viewed continuously)    |
