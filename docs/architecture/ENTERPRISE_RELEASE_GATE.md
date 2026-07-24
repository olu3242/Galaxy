# Galaxy Enterprise Release Gate

**Version:** 1.0  
**Owner:** Platform Engineering

---

## Purpose

A successful build alone never qualifies a Galaxy release. The Enterprise Release Gate is a mandatory deployment gate that certifies platform reliability before any promotion to production.

The gate fails automatically when any of the following conditions are true.

---

## Release Gate Conditions

### Mandatory Blockers (CI fails immediately)

| #   | Condition                                | Check                                            |
| --- | ---------------------------------------- | ------------------------------------------------ |
| 1   | Any workstream crashes on the happy path | `workstream_certification.test.ts` must pass     |
| 2   | Cross-tenant RLS isolation failure       | `rls-isolation.test.ts` must pass                |
| 3   | DAG execution breaks                     | All workflow templates pass DAG integrity check  |
| 4   | Generic runtime errors exist             | ESLint `no-throw-literal` + custom WRF lint rule |
| 5   | Audit chain incomplete                   | `audit_logs` assertion in certification test     |
| 6   | Telemetry missing                        | `workstream_telemetry` row count assertion       |

### Runtime Health Blockers (checked against staging environment)

| #   | Condition                       | Threshold                                         |
| --- | ------------------------------- | ------------------------------------------------- |
| 7   | Critical dependency unavailable | Any `health = 'unavailable'` in dependency matrix |
| 8   | Platform error rate             | `errorRate ≥ 5%` over 60-minute window            |
| 9   | Stage success rate              | Any stage `successRate < 95%`                     |
| 10  | p99 latency                     | `p99 > 10,000ms`                                  |
| 11  | Queue backlog                   | Any queue `depth > 10,000`                        |
| 12  | Agent failure rate              | `agent_os failedCount / total > 10%`              |

---

## CI Gate Configuration

The following checks must all be green in GitHub Actions before a PR can merge to `main`:

```yaml
jobs:
  unit-tests: # pnpm test — all packages
  integration-rls: # DATABASE_URL required — rls-isolation.test.ts
  wrf-certification: # DATABASE_URL required — workstream-certification.test.ts
  typecheck: # pnpm typecheck — all packages
  lint: # pnpm lint — all packages
  security-scan: # CodeQL + secret scanning + dependency audit
  build: # pnpm build — all packages
```

---

## Staging Health Gate (Post-Deploy Check)

After deploying to staging, the release pipeline must call:

```bash
# 1. Dependency health check
curl -sf -H "x-admin-secret: $ADMIN_SECRET" \
  "$STAGING_URL/api/v1/admin/runtime/health" \
  | jq -e '.overall == "healthy" or .overall == "warning"'

# 2. Runtime health matrix
MATRIX=$(curl -sf -H "x-admin-secret: $ADMIN_SECRET" \
  "$STAGING_URL/api/v1/admin/runtime/health-matrix?windowMinutes=60")

echo "$MATRIX" | jq -e '.releaseGate.passed == true' || {
  echo "RELEASE GATE FAILED:"
  echo "$MATRIX" | jq '.releaseGate.blockers'
  exit 1
}

echo "Staging health gate passed ✅"
```

---

## Automated Health Matrix Report

The Health Matrix is regenerated after every deployment. It must be attached to every release PR as a CI artifact. Format:

```
Galaxy Workstream Health Matrix — 2026-07-24T10:00:00Z

Overall: ✅ HEALTHY

Dependencies
  postgresql:           ✅ healthy (12ms)
  redis:                ✅ healthy (3ms)
  workflow_os:          ✅ healthy (8ms)
  agent_os:             ✅ healthy (5ms)
  knowledge_os:         ✅ healthy (14ms)
  audit_service:        ✅ healthy (6ms)
  notification_engine:  ✅ healthy (9ms)
  identity_service:     ✅ healthy (4ms)
  organization_service: ✅ healthy (3ms)

Runtime (60-minute window)
  p50: 340ms | p95: 1200ms | p99: 3100ms
  Error rate: 1.2%
  Throughput: 8.4 req/min

Release Gate: ✅ PASSED (0 blockers)
```

---

## Escalation Path

When the release gate blocks a deployment:

1. **Identify the blocking condition** — read `blockers[]` from the health matrix response
2. **Check Mission Control** — `GET /api/v1/admin/runtime/workstreams` for active failures
3. **Check dependency drill-down** — `GET /api/v1/admin/runtime/health` for which dependency is failing
4. **Fix the root cause** — do not patch the gate condition directly
5. **Re-run the certification suite** — `pnpm test --filter @galaxy/api`
6. **Re-check the health matrix** — confirm `releaseGate.passed == true`
7. **Re-deploy** — the gate re-evaluates automatically on every deploy

---

## Definition of Done

A Galaxy release is production-ready when:

- [x] All 8 CI checks are green
- [x] RLS isolation test: zero cross-tenant failures
- [x] Workstream certification test: all 17 lifecycle assertions pass
- [x] Dependency health matrix: `overall` is `healthy` or `warning` (not `degraded` / `unavailable`)
- [x] Runtime error rate: `< 5%` over 60-minute staging window
- [x] All certified workflow templates pass DAG integrity check
- [x] `releaseGate.passed == true` from `/api/v1/admin/runtime/health-matrix`
