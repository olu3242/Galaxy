# Revenue Operations Architecture

## Overview

The Revenue Operations module (workstreams K and L in `@galaxy/platform`) provides financial health tracking and commercial policy management. Revenue snapshots are global records (no RLS) because they represent aggregated platform-wide metrics, while customer health scores are cross-tenant analytics used for churn prediction and intervention.

## Services and Tables

**RevenueOperationsService** records point-in-time `revenue_snapshots` capturing MRR, ARR, active subscription count, and monthly churn/new metrics. The `calculateCurrentMrr` method computes live MRR by joining `subscriptions` and `plans`, and `getChurnRate` computes month-to-date churn. **CustomerHealthService** scores individual organizations using activity signals (audit log frequency over 30 days) and subscription status, producing a 0-100 score stored in `customer_health_scores`. `calculateHealthScore` applies the scoring model and persists the result. `listHealthScores` returns the latest score per organization for fleet-level health dashboards.

**CommercialPolicyService** manages `commercial_policies` (global JSONB rules by policy type) and supports `entitlement_mappings` for per-plan resource limits, enabling flexible commercialization rules without code changes.

## API Endpoints

- `POST /platform/revenue/snapshots` — record a revenue snapshot
- `GET /platform/revenue/snapshots` — list revenue history
- `GET /platform/health/customer?organizationId=` — get customer health score(s)
