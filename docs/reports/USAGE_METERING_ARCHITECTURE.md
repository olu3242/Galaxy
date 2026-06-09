# Usage Metering Architecture

## Overview

The Usage Metering module (workstream J in `@galaxy/platform`) provides event-based consumption tracking and quota enforcement for Galaxy resources. The design separates raw event ingestion from aggregated records, allowing high-frequency writes without affecting query performance for reporting.

## Services and Tables

**UsageMeteringService** records individual `usage_events` (resource type, quantity, metadata) and queries them with time-range and resource-type filters. Aggregate `usage_records` store pre-computed period summaries for billing and reporting. The service always sets tenant context before any database operation, ensuring RLS isolation. **QuotaService** enforces limits defined in `usage_limits` (per-org, per-resource-type with a `reset_period`). The `checkQuota` method computes current-month consumption on-the-fly by summing `usage_events` since `date_trunc('month', NOW())` and compares against the stored limit, returning a `QuotaCheckResult` with `allowed`, `current`, `limit`, and `percentUsed`. Usage alerts in `usage_alerts` can be configured with threshold percentages to trigger warnings before hard limits are hit.

## API Endpoints

- `POST /platform/usage/events` — record a usage event
- `GET /platform/usage/records?organizationId=` — retrieve usage records
- `GET /platform/usage/limits?organizationId=` — list quota limits
