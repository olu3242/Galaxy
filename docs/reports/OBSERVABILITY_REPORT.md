# Observability Report

_Generated: 2026-06-09_

---

## Overview

Galaxy has two observability implementations serving distinct purposes. This report documents both, their roles, and how they are expected to interact.

---

## Implementation 1: @galaxy/observability

**Path:** `packages/modules/observability/src/`

**Package:** `@galaxy/observability`

**Migration:** 035 (tables), 037 (RLS)

### Directory Structure

```
src/
  alerts/       — Alert rule management and alert dispatch
  health/       — Platform health check tracking
  incidents/    — Incident creation and lifecycle management
  metrics/      — Operational metrics ingestion and querying
  slo/          — Service Level Objective tracking
  index.ts
  types.ts
```

### Tables (migration 035)

- `platform_health_checks` — Health probe results per service
- `operational_metrics` — Time-series operational metrics
- `alert_rules` — Configurable alert thresholds
- `alerts` — Fired alerts with severity and status
- `incidents` — Incident records with severity, status, resolution

### API Route

Registered in `apps/api/src/index.ts` as `observabilityRoutes` → `routes/observability.ts`

**Endpoints include:**

- `GET /observability/health` — System health status
- `POST /observability/metrics` — Ingest operational metrics
- `GET /observability/alerts` — List active alerts
- `GET /observability/incidents` — List incidents

### Role

Full-stack operational observability for the Galaxy platform itself. Consumed by on-call teams, SREs, and the Mission Control dashboard. Tracks SLOs, fires alerts, and manages incident lifecycle.

---

## Implementation 2: @galaxy/platform Observability Layer

**Path:** `packages/modules/platform/src/observability/`

**Package:** `@galaxy/platform`

**Migration:** 067 (platform_metrics, platform_health_snapshots tables)

### Files

```
src/observability/
  MetricsService.ts          — Platform-level metrics aggregation
  PlatformHealthService.ts   — Aggregate health snapshot across tenants
```

### Tables (migration 067)

- `platform_metrics` — Aggregated platform-wide metrics
- `platform_health_snapshots` — Point-in-time health summaries

### API Route

Part of `routes/platform.ts` (registered as `platformRoutes`).

### Role

Cross-tenant platform health aggregation for platform operators and admin dashboards. Provides a rolled-up view of organizational health rather than per-service operational health. Distinct from `@galaxy/observability` which handles real-time incident response.

---

## Interaction Model

```
@galaxy/observability         @galaxy/platform observability
       │                               │
       ▼                               ▼
 Per-service metrics          Cross-tenant health snapshots
 Alert rules & firing         Platform-level KPI aggregation
 Incident management          Admin / ops dashboard data
 SLO tracking
       │
       ▼
 routes/observability.ts      routes/platform.ts
 /observability/*             /platform/*
```

Both are registered independently. There is no data duplication at the application layer. The `@galaxy/platform` observability layer may read aggregated data from the `@galaxy/observability` module in future integrations.

---

## Alerting Pipeline

Based on `@galaxy/observability`:

1. Metrics are ingested via `POST /observability/metrics`
2. Alert rules are evaluated against ingested metrics
3. When thresholds are breached, alerts fire and are stored in the `alerts` table
4. Severe or unresolved alerts escalate to incidents via `incidents` table
5. SLO burn rates are tracked separately via the `slo/` submodule

---

## Gaps and Recommendations

| Gap                                                    | Recommendation                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| No webhook/notification integration visible for alerts | Wire `@galaxy/notifications` to fire on alert creation                                               |
| SLO tracking tables not confirmed in migration 035     | Verify SLO tables are included or add migration 071                                                  |
| platform_metrics vs operational_metrics overlap        | Document distinction — platform_metrics is aggregate, operational_metrics is per-service time-series |
| No distributed tracing (e.g., OpenTelemetry)           | Phase 4.9 consideration                                                                              |

---

## Verdict

The two-layer observability architecture is intentional and well-structured. No action required beyond the items listed in the Gaps section above.
