# Intelligence Network Readiness Report

**Date:** 2026-06-08

## Implemented Capabilities

### Cross-Org Intelligence Network (`@galaxy/intelligence-network`)

- Opt-in contribution system: organizations contribute anonymized metrics
- Laplace noise injection (differential privacy, ε=1.0) before storing contributions
- Benchmark aggregation with minimum cohort enforcement (n≥10)
- Percentile calculation (p25/p50/p75/p90) using PostgreSQL `PERCENTILE_CONT`
- Peer comparison: ranks organization against p50 and p75 of cohort
- Workflow recommendations for metrics below median
- Opt-out (withdraw) support per metric per period
- REST API: POST `/intelligence/opt-in`, POST `/intelligence/opt-out`, GET `/intelligence/benchmarks`, `/peer-comparison`, `/recommendations`

### Benchmarking (`@galaxy/benchmarking`)

- Organization percentile lookup against industry+size_bucket+period cohorts
- Full industry benchmark report (all metrics for a cohort)
- Comparative report with summary (metrics above median, overall percentile)
- REST API: GET `/benchmarking/percentile`, `/benchmarking/report`, `/benchmarking/comparison`

### Database

- `intelligence_contributions` table with unique constraint (org, metric, period)
- `intelligence_benchmarks` table (no RLS — cross-org readable)
- Anonymization noise stored per contribution for auditability

## Gaps

- Benchmark aggregation job not scheduled (must be called manually)
- Industry and size_bucket classification not auto-derived from organization profile
- No consent management UI beyond opt-in API endpoint
- Federated learning patterns (vs centralized contributions) not implemented
- No minimum contribution age before inclusion in benchmarks
- Privacy budget tracking (total ε exposure per org) not implemented

## Technical Debt

- Laplace noise scale is hardcoded (sensitivity=1.0, epsilon=1.0); needs per-metric tuning
- `aggregateBenchmarks` does not pass industry/size_bucket from contributions — relies on caller
- Benchmark period is calendar-month string only; no weekly or quarterly options

## Readiness Score: 65/100

## Recommended Next Steps

1. Schedule benchmark aggregation as a weekly BullMQ job
2. Auto-classify organization industry/size from onboarding metadata
3. Build privacy budget tracking per organization
4. Add consent management dashboard in web app
5. Tune per-metric Laplace noise parameters based on value ranges
