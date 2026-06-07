# Phase 08: Platform Admin

## Objectives

Implement the Platform Admin module, which gives the Galaxy platform operators the visibility and control tools needed to run the platform safely and profitably at scale. This phase delivers the Platform Admin web console, automated tenant provisioning, billing integration, platform-wide usage metrics, and health monitoring. After this phase, Galaxy can onboard new organizations self-serve, track platform revenue, and detect health issues before they impact customers.

---

## Deliverables

### 1. Platform Admin Console

- Dedicated Platform Admin section in the web dashboard, accessible only to members with the `platform:admin` role
- Route: `/admin` (protected by role check; 404 for all other roles to avoid information disclosure)
- Admin console pages:
  - **Organization List:** paginated list of all organizations with status, tier, WABA status, member count, and last activity
  - **Organization Detail:** full org record, WABA config, active workflow count, member count, recent audit events
  - **Member Search:** cross-tenant member search by email or phone number (audit-logged)
  - **Platform Health:** real-time display of queue depths, error rates, database connection pool usage, Redis memory usage
  - **DLQ Manager:** view dead-letter queue contents, inspect job payloads, replay or discard jobs
  - **Audit Log Explorer:** cross-tenant audit log query (requires `manage:audit` permission; every query is itself audit-logged)
  - **Insights Summary:** platform-wide Loop Engine insight statistics (counts by type, organization, and action status)

### 2. Tenant Provisioning

- Self-service organization sign-up: `POST /api/v1/public/organizations/register` — public endpoint accepting organization name, admin email, WABA phone number; creates the organization and sends an onboarding email/WhatsApp to the admin
- Platform Admin–initiated provisioning: `POST /api/v1/admin/organizations` — Platform Admin creates an org with full config including tier and WABA settings
- Provisioning flow:
  1. Create `organizations` record with status `provisioning`
  2. Seed default system roles for the new tenant
  3. Create the initial Organization Owner member record
  4. Send onboarding WhatsApp/email to the Organization Owner
  5. Update status to `active`
  6. Emit `identity.organization.created`
  7. Audit log the full provisioning event
- Organization suspension: `PATCH /api/v1/admin/organizations/:id/suspend` — sets status to `suspended`; all API requests for the tenant return 403
- Organization deletion: `DELETE /api/v1/admin/organizations/:id` — soft delete with 30-day data retention window; GDPR-compliant hard delete schedule

### 3. Billing Integration

- Subscription tier tracking: `organizations.tier` field (`starter`, `growth`, `enterprise`)
- Tier change: `PATCH /api/v1/admin/organizations/:id/tier` — Platform Admin changes subscription tier; emits `admin.organization.tier_changed`
- Usage metering:
  - Active workflow run count per billing period
  - Agent session count per billing period
  - Active member count
  - WhatsApp message volume (inbound + outbound)
- Usage metrics API: `GET /api/v1/admin/organizations/:id/usage` — returns usage counters for the current billing period
- Stripe webhook integration (or equivalent payment provider): billing events (subscription created, updated, cancelled, invoice paid/failed) update organization tier and status
- Overage detection: if an org exceeds their tier's limits (defined in `packages/config`), an alert fires to the Platform Admin and an overdue notice is sent to the Organization Owner

### 4. Usage Metrics

- `GET /api/v1/admin/metrics` — platform-wide metrics:
  - Total organizations (active, suspended, deleted)
  - Total active members
  - Workflow runs completed (today, this week, this month)
  - Agent sessions (today, this week)
  - WhatsApp messages (today, this week)
  - Average platform API response time p50/p95/p99
  - Queue depths for all BullMQ queues
  - Error rate (5xx responses as % of total) over rolling 24 hours
- Metrics data is sourced from the Analytics OS aggregation layer and real-time BullMQ queue stats
- `GET /api/v1/admin/metrics/timeseries` — time-series data for any metric, configurable window and interval

### 5. Platform Health Monitoring

- `/health` endpoint remains available without authentication; returns:
  - `status`: `healthy`, `degraded`, `unhealthy`
  - `database`: connection pool status, query latency
  - `redis`: connection status, memory usage
  - `queues`: depth and latest-processed timestamp for each queue
  - `version`: current API version
- Internal health check API: `GET /api/v1/admin/health` (Platform Admin only) — detailed health data including DLQ depths, active worker counts, and per-queue latency
- Automated alerting: a background health check job runs every 60 seconds and fires alerts to the platform on-call webhook if:
  - Any queue depth exceeds the configured threshold (default: 50 jobs)
  - Database query latency exceeds 500ms p95
  - Redis memory usage exceeds 80% of available
  - Error rate exceeds 5% over 5 minutes
  - Any DLQ has >0 jobs (immediate alert)

### 6. Platform Security Controls

- gitleaks scan in CI finalized and confirmed green
- CodeQL baseline reviewed; all findings resolved or accepted with justification
- `pnpm audit --prod` green with no high/critical CVEs
- Security headers verified on all production routes
- Rate limiting verified for all endpoint classes
- Pre-launch security checklist (`security/GOVERNANCE.md`) completed and signed off by Platform Lead
- External penetration test scheduled (or completed) for API and web surfaces

---

## Dependencies

- All previous phases (01–07) complete
- Stripe account (or equivalent) configured for billing integration
- Platform Admin member records seeded in production database
- Alert webhook URL configured (`ALERT_WEBHOOK_URL` environment variable)
- DNS and TLS certificates configured for the production domain

---

## Acceptance Criteria

- [ ] Platform Admin logs in and sees the `/admin` console; a non-admin member sees 404
- [ ] `POST /api/v1/public/organizations/register` creates a new organization and sends onboarding notification
- [ ] `POST /api/v1/admin/organizations` (Platform Admin) creates an org with full config
- [ ] Organization suspension: `PATCH /api/v1/admin/organizations/:id/suspend` → subsequent API calls for that tenant return 403
- [ ] `GET /api/v1/admin/organizations/:id/usage` returns accurate usage counters for active members, workflow runs, and agent sessions
- [ ] Tier change: `PATCH /api/v1/admin/organizations/:id/tier` changes tier and emits audit event
- [ ] Platform health endpoint `/health` returns `healthy` when PostgreSQL and Redis are up
- [ ] DLQ Manager: a job in a DLQ is visible in the admin console; replaying it re-enqueues the job (verified by BullMQ)
- [ ] Audit Log Explorer: Platform Admin queries audit log for a cross-tenant search; the query itself is recorded as a `critical` severity `admin` category audit log entry
- [ ] Pre-launch security checklist completed (all items checked)
- [ ] All Platform Admin actions are audit-logged with `actor_type: system` or the Platform Admin's member ID
- [ ] Health alert fires to the on-call webhook when a test DLQ job is manually inserted

---

## Risks

| Risk                                                                     | Likelihood | Impact | Mitigation                                                                                                                                      |
| ------------------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Billing provider API changes breaking tier management                    | Low        | Medium | Abstract billing provider behind an interface; use Stripe's versioned API with pinned version                                                   |
| Self-service sign-up creates fraudulent organizations                    | Medium     | Medium | CAPTCHA on the public sign-up endpoint; email/phone verification required before org is activated                                               |
| Platform Admin console security misconfiguration (exposed to non-admins) | Low        | High   | 404 for non-admins (not 403, to avoid information disclosure); middleware enforces platform:admin role at the router level                      |
| Alert storms during infrastructure incidents                             | Medium     | Low    | Implement alert deduplication and grouping (e.g., don't fire 500 individual DLQ alerts — fire one with a count)                                 |
| GDPR deletion request complexity with multi-table tenant data            | Medium     | Medium | Implement a `DataDeletionJob` that traverses all tenant tables in dependency order; test with a full tenant deletion in the staging environment |

---

## Success Metrics

| Metric                            | Target                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Organization provisioning time    | New organization fully provisioned and owner notified in under 2 minutes        |
| Admin console page load time      | Under 1 second for all admin pages (including organization list with 1000 orgs) |
| Platform health detection latency | Under 2 minutes from a health issue occurring to alert firing                   |
| DLQ visibility                    | 100% of DLQ jobs visible and replayable within 5 minutes of entering the DLQ    |
| Pre-launch security checklist     | 100% of items completed and verified                                            |
