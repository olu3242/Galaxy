# Billing Platform Architecture

## Overview

The Billing module (`@galaxy/billing`) provides full commercial infrastructure for Galaxy Loop OS: billing accounts, subscription management, usage metering, revenue operations, and commercial readiness tooling.

## Module Structure

```
packages/modules/billing/src/
├── BillingService.ts                # Workstream H: Billing accounts CRUD
├── PaymentService.ts                # Workstream H: Payment recording and history
├── types.ts                         # Shared types: Plan, Subscription, Invoice, UsageEvent
├── invoices/
│   └── InvoiceService.ts            # Workstream H: Invoice generation, listing, marking paid
├── subscriptions/
│   ├── SubscriptionService.ts       # Workstream I: Sub create/upgrade/downgrade/cancel
│   ├── PlanService.ts               # Workstream I: Plan CRUD (Starter/Growth/Professional/Enterprise)
│   └── TrialService.ts              # Workstream I: Trial start/status/conversion
├── usage/
│   ├── UsageMeteringService.ts      # Workstream J: Usage event recording and aggregation
│   └── QuotaService.ts              # Workstream J: Quota enforcement and alerts
├── limits/
│   └── PlanLimitsService.ts         # Plan limit checking
├── revenue/
│   ├── RevenueOperationsService.ts  # Workstream K: MRR, ARR, churn, retention metrics
│   └── CustomerHealthService.ts     # Workstream K: Per-org health scoring
├── commercial/
│   ├── CommercialService.ts         # Workstream L: Pricing config, billing policies
│   └── SubscriptionGovernanceService.ts  # Workstream L: Renewal enforcement, enterprise controls
└── db/migrations/
    ├── 001_billing.ts               # billing_accounts, payments, credits, refunds, billing_events, billing_policies
    ├── 002_subscriptions.ts         # subscription_events, trials
    └── 003_usage.ts                 # usage_records, usage_snapshots, usage_limits, usage_alerts
```

## Plan Tiers

| Tier | Members | Workflows | Agents | API Calls/mo | Storage |
|------|---------|-----------|--------|--------------|---------|
| Starter | 25 | 50 | 3 | 10,000 | 512 MB |
| Growth | 100 | 200 | 10 | 100,000 | 2 GB |
| Professional | 500 | 1,000 | 50 | 1,000,000 | 10 GB |
| Enterprise | 10,000 | 10,000 | 1,000 | 10,000,000 | 100 GB |

## Usage Metering

Usage events are recorded per `(organizationId, subscriptionId, eventType)`. Supported event types:
- `workflow_run` — workflow execution
- `agent_execution` — AI agent action
- `api_call` — external API invocation
- `storage_mb` — storage consumed
- `member_seat` — active member count

Quota enforcement runs at event check time and raises `usage_alerts` at 80% threshold.

## Revenue Metrics

`RevenueOperationsService` computes:
- **MRR** — sum of `monthly_price_cents` for active subscriptions
- **ARR** — MRR × 12
- **Expansion Revenue** — estimated 5% MRR uplift
- **Churn Rate** — cancelled subscriptions / total subscriptions in period
- **Retention Rate** — 1 - churn rate

## Customer Health Scoring

`CustomerHealthService` produces a 0-100 health score per org:
- Activity score (0-33): based on audit log event count in last 30 days
- Engagement score (0-33): based on days since last activity
- Payment score (0-34): based on failed payment count

## API Routes

Routes registered under `/api/v1/billing/v2/...`.

| Method | Path | Description |
|--------|------|-------------|
| POST | /billing/v2/accounts | Create billing account |
| GET | /billing/v2/accounts/:orgId | Get billing account |
| PATCH | /billing/v2/accounts/:orgId | Update billing account |
| POST | /billing/v2/payments | Record payment |
| GET | /billing/v2/organizations/:orgId/payments | List payments |
| GET | /billing/v2/plans | List plans |
| POST | /billing/v2/plans | Create plan (admin) |
| DELETE | /billing/v2/plans/:planId | Deactivate plan (admin) |
| POST | /billing/v2/organizations/:orgId/trials | Start trial |
| GET | /billing/v2/organizations/:orgId/trials | Get trial status |
| POST | /billing/v2/organizations/:orgId/trials/convert | Convert trial to paid |
| GET | /billing/v2/organizations/:orgId/quota/:eventType | Check quota |
| GET | /billing/v2/organizations/:orgId/usage-alerts | Get usage alerts |
| GET | /billing/v2/revenue/metrics | Revenue metrics (admin) |
| GET | /billing/v2/organizations/:orgId/health | Customer health |
| GET | /billing/v2/pricing | Pricing config |
| GET | /billing/v2/policies/:key | Get billing policy (admin) |
| PUT | /billing/v2/policies/:key | Set billing policy (admin) |
| POST | /billing/v2/organizations/:orgId/governance/renew | Enforce renewal |
| GET | /billing/v2/organizations/:orgId/enterprise-access/:feature | Enterprise access check |
