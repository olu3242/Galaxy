# Galaxy Executive Intelligence

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

Executive Intelligence surfaces business-outcome metrics to organizational leaders — not infrastructure dashboards. Where a system dashboard asks "Is the platform healthy?", Executive Intelligence asks "Is the organization operating efficiently and improving over time?"

The module aggregates AOF observations, optimization outcomes, and workflow telemetry into KPIs that map directly to business value: cost savings, employee productivity, automation rate, compliance score, and customer satisfaction impact.

---

## Metrics Surfaced

| Metric                    | Definition                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Operational Health        | Weighted composite of SLA compliance, error rate, and agent availability (0–100 score)         |
| Workstream Throughput     | Workflows completed per day, trended over 30/60/90 days                                        |
| AI Productivity           | Ratio of agent-completed stages to human-completed stages                                      |
| ROI by Workflow           | (Time saved × blended hourly rate) − platform cost, per workflow template                      |
| Cost Savings              | Cumulative USD saved by applied optimizations vs. pre-optimization baseline                    |
| Automation Rate           | Percentage of workflow stages completed without human intervention                             |
| Employee Workload         | Average active workflow assignments per member, with burnout risk threshold at 85th percentile |
| Customer Satisfaction     | Aggregate NPS-proxy derived from workflow completion speed and first-pass success rate         |
| Compliance Score          | Percentage of workflows that completed with zero governance violations                         |
| Organizational Efficiency | Throughput per headcount, normalized against org size tier                                     |

---

## KPI Definitions and Calculation Methodology

### Operational Health Score

```
healthScore = (
  slaComplianceRate * 0.40 +
  (1 - platformErrorRate) * 0.35 +
  agentAvailabilityRate * 0.25
) * 100
```

Inputs are computed over the trailing 24-hour window. Score below 70 triggers an executive alert.

### ROI by Workflow

```
roi = (medianTimeSavedPerRun * blendedHourlyRate * runsInPeriod) - (platformCostInPeriod)
```

`medianTimeSavedPerRun` = baseline median completion time − current median completion time (from `aof_learning_records`).  
`blendedHourlyRate` is set per organization in `organization_policies.blended_hourly_rate_usd`.

### Automation Rate

```
automationRate = agentCompletedStages / totalStages
```

Computed from `workstream_telemetry` joined with `aof_observations`, over the selected period.

### Compliance Score

```
complianceScore = workflowsWithZeroViolations / totalCompletedWorkflows
```

A governance violation is any `aof_decisions` record where `governance_verdict.blockers` is non-empty and the workflow was ultimately executed via escalation override.

---

## Executive Dashboard Data Model

```typescript
interface ExecutiveDashboardPayload {
  organizationId: string;
  generatedAt: string; // ISO-8601
  periodDays: number; // default 30
  operationalHealth: {
    score: number; // 0–100
    trend: 'improving' | 'stable' | 'degrading';
    alertThreshold: number; // 70
  };
  workstreamThroughput: {
    completedToday: number;
    completedThisPeriod: number;
    trend: TrendPoint[]; // [{date, count}]
  };
  aiProductivity: {
    automationRate: number; // 0–1
    agentToHumanRatio: number;
    trend: TrendPoint[];
  };
  costSavings: {
    totalSavedUsd: number;
    savingsThisPeriod: number;
    topWorkflow: { name: string; savedUsd: number };
  };
  employeeWorkload: {
    averageAssignments: number;
    burnoutRiskCount: number; // members above 85th percentile
    members: WorkloadSummary[];
  };
  complianceScore: number; // 0–1
  organizationalEfficiency: number; // throughput per headcount
}
```

---

## API

### Executive Dashboard

```http
GET /api/v1/admin/aof/intelligence/executive?periodDays=30
x-admin-secret: <secret>
```

Response: `ExecutiveDashboardPayload` (see above).

```json
{
  "organizationId": "org_01HABC",
  "generatedAt": "2026-07-24T10:00:00Z",
  "periodDays": 30,
  "operationalHealth": { "score": 94, "trend": "improving", "alertThreshold": 70 },
  "costSavings": {
    "totalSavedUsd": 18420,
    "savingsThisPeriod": 4210,
    "topWorkflow": { "name": "Vendor Onboarding", "savedUsd": 1840 }
  },
  "complianceScore": 0.98,
  "automationRate": 0.76
}
```

### ROI Report

```http
GET /api/v1/admin/aof/intelligence/roi?periodDays=90&workflowId=wf_01HXYZ
x-admin-secret: <secret>
```

Response:

```json
{
  "workflowId": "wf_01HXYZ",
  "workflowName": "Vendor Onboarding",
  "periodDays": 90,
  "runsInPeriod": 312,
  "medianTimeSavedPerRunMs": 82000,
  "blendedHourlyRateUsd": 35.0,
  "totalTimeSavedHours": 7.1,
  "grossSavingsUsd": 6314,
  "platformCostUsd": 420,
  "netRoiUsd": 5894,
  "roiMultiple": 15.0
}
```

---

## Data Freshness

Executive Intelligence data is pre-aggregated by a BullMQ recurring job (`aof:intelligence:aggregate`) that runs every 15 minutes. The `GET` endpoints serve from the pre-aggregated cache. The `generatedAt` field in every response tells the caller how fresh the data is.

For on-demand recalculation, pass `?refresh=true`. This triggers a synchronous recalculation and is rate-limited to once per minute per organization.

---

## Definition of Done

- [x] All 10 metrics are populated in every `ExecutiveDashboardPayload` response
- [x] `operationalHealth.score < 70` emits an `aof.executive.alert` GalaxyEvent
- [x] ROI calculation uses `organization_policies.blended_hourly_rate_usd`, not a hardcoded value
- [x] Aggregation job runs every 15 minutes and is monitored for failures
- [x] `?refresh=true` is rate-limited per organization (1 req/min)
- [x] Phone numbers and member PII are never included in dashboard payloads
