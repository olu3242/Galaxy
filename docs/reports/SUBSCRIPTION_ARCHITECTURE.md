# Subscription Architecture

## Overview

The Subscription module (workstream I in `@galaxy/platform`) manages the plan-subscription lifecycle for Galaxy organizations. Plans are defined globally (no RLS) while subscriptions are tenant-scoped. Every status transition is recorded as an immutable event, providing a full audit trail of the subscription lifecycle.

## Services and Tables

**PlanService** manages the `plans` table, which defines available pricing tiers with monthly and annual pricing in cents, a JSONB `features` field, and an `active` flag. Plans are global and accessible without tenant context. **SubscriptionService** manages `subscriptions` per organization, supporting statuses: `trialing`, `active`, `past_due`, `cancelled`, and `unpaid`. Every `createSubscription` and `updateStatus` call appends an event to `subscription_events`, creating an immutable audit trail. **TrialService** wraps `SubscriptionService` to provide `startTrial`, `getTrialStatus` (with days remaining calculation), and `convertTrial`.

## API Endpoints

- `GET /platform/plans` — list active plans
- `POST /platform/subscriptions` — create a subscription for an org
- `GET /platform/subscriptions?status=` — list subscriptions with status filter
- `PATCH /platform/subscriptions/:subscriptionId` — update subscription status
