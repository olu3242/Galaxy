# Intelligence Network Architecture

## Concept

The Galaxy Intelligence Network is a privacy-preserving meta-layer that aggregates anonymized operational signals across all tenant organizations to produce:

1. **Industry benchmarks** — how does your org compare to peers?
2. **Workflow recommendations** — what patterns are working for similar orgs?
3. **Risk warnings** — early signals from the aggregate that predict org-specific issues
4. **Agent performance baselines** — expected confidence/accuracy for agent decisions

---

## Network Topology

```
Each Tenant Org
  └── ContributionEngine (local, per-tenant)
        └── anonymize + noise → Contribution Record
              └── → Intelligence Bus (system-level, cross-tenant)
                    └── BenchmarkAggregator
                          └── → IntelligenceBenchmarks table
                                └── → BenchmarkQueryService (per-tenant read)
```

The Intelligence Bus is a **system-level service** — it reads contributions from ALL tenants but never exposes raw tenant data to any other tenant.

---

## Anonymization Pipeline

```typescript
interface AnonymizationPipeline {
  // Step 1: Remove all identifiers
  stripIdentifiers(data: Record<string, unknown>): Record<string, unknown>;

  // Step 2: Add Laplace noise for differential privacy
  addNoise(value: number, sensitivity: number, epsilon: number): number;

  // Step 3: Aggregate into cohort (require k >= 10)
  aggregateCohort(contributions: Contribution[], minCohortSize: number): CohortStats | null;

  // Step 4: Publish only if cohort is large enough
  publish(stats: CohortStats): IntelligenceBenchmark;
}
```

**Epsilon parameter** (privacy budget): Default ε = 0.5 (strong privacy). Configurable per metric type.

---

## Benchmark Dimensions

Each benchmark is keyed by: `(industry, size_bucket, metric_key, period)`

| Metric Key                            | Description                                   | Unit       |
| ------------------------------------- | --------------------------------------------- | ---------- |
| `workflow.completion_rate`            | % of runs reaching completed status           | percentage |
| `workflow.sla_breach_rate`            | % of runs breaching SLA                       | percentage |
| `approval.median_decision_time_hours` | Median time from approval request to decision | hours      |
| `agent.decision_confidence_mean`      | Average agent decision confidence score       | 0-100      |
| `task.completion_rate_7d`             | 7-day rolling task completion rate            | percentage |
| `escalation.rate`                     | % of workflow runs that get escalated         | percentage |
| `knowledge.utilization_rate`          | % of workflows referencing knowledge docs     | percentage |

---

## Peer Matching Algorithm

When an org requests "organizations like mine", the system:

1. Computes the org's profile vector: `[industry, size_bucket, dominant_domain, plan_tier]`
2. Finds all cohorts matching those dimensions with contribution count ≥ 10
3. Returns anonymized aggregate stats for matching cohorts
4. Never returns individual org data or list of peer organizations

---

## Privacy Architecture Guarantees

| Guarantee                   | Implementation                                                           |
| --------------------------- | ------------------------------------------------------------------------ |
| No raw data crosses tenants | Contribution records are system-only; no tenant can query another's data |
| Minimum cohort size         | k-anonymity: no stat published with fewer than 10 contributors           |
| Differential privacy        | Laplace noise on all numeric values before publishing                    |
| Opt-in only                 | Feature flag `intelligence_network_opt_in` per org                       |
| Right to erasure            | Contributions can be deleted; triggers cohort recalculation              |
| Audit trail                 | All contribution/withdrawal actions logged in `admin_action_logs`        |

---

## API Surface (Phase 13)

```
GET  /api/v1/intelligence/benchmarks?industry=&size=&metric=&period=
GET  /api/v1/intelligence/peer-comparison?organizationId=
GET  /api/v1/intelligence/recommendations?organizationId=
POST /api/v1/intelligence/opt-in { organizationId, actorId }
POST /api/v1/intelligence/opt-out { organizationId, actorId }
GET  /api/v1/intelligence/contribution-status?organizationId=
```

---

## Predictive Operations Engine (Phase 14)

### Workload Forecasting

Uses the last 90 days of workflow_run history to project next 30 days:

- Moving average on daily run counts by domain
- Seasonality detection (weekly patterns)
- Capacity recommendations based on projected load

### SLA Breach Prediction

For each active workflow run:

1. Compute elapsed time / SLA duration ratio
2. Apply historical breach rates for that workflow type
3. Score breach probability 0-100
4. Flag runs with score > 70 for proactive escalation

### Churn Risk Detection

For member engagement:

- Days since last workflow trigger
- Task completion rate trend (30d vs 90d)
- Approval response time trend
- Outputs: engagement score, churn risk flag

All predictions are:

- Stored in `predictive_scores` table
- Surfaced via COO briefings
- Overridable by human annotation
- Explainable (each score includes contributing factors)
