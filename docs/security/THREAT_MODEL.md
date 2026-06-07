# Galaxy Threat Model

**Version:** 1.0
**Date:** 2026-06-07
**Methodology:** STRIDE

---

## System Overview

Galaxy is a multi-tenant SaaS platform. The attack surface includes:
1. WhatsApp webhook endpoint (public, unauthenticated at network level)
2. REST API (JWT-authenticated)
3. Web dashboard (session-authenticated)
4. PostgreSQL database (internal, RLS-protected)
5. Redis / BullMQ (internal)
6. AI agent runtime (internal, with external Anthropic API calls)
7. WhatsApp Cloud API (external dependency)

---

## Trust Boundaries

```
[Internet]
    |
    ├── [WhatsApp Cloud API] → /api/v1/webhooks/whatsapp
    ├── [End User Browser] → /api/v1/* (JWT required)
    └── [Attacker]
                |
    [Cloudflare WAF + Rate Limiter]
                |
    [AWS ALB]
                |
    [API Pods — Apps/api]
                |
    ├── [Internal: PostgreSQL] ← RLS boundary (tenant context)
    ├── [Internal: Redis]
    └── [External: Anthropic API] ← API key authentication
```

---

## Threat Analysis (STRIDE)

### S — Spoofing

| Threat | Asset | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Attacker spoofs WhatsApp webhook (forged Meta signature) | WhatsApp webhook | High (publicly known endpoint) | High (arbitrary event injection) | HMAC-SHA256 signature validation before any processing; `timingSafeEqual` comparison |
| Attacker uses stolen JWT token | API access | Medium | High | Short token expiry (24h); token revocation on logout; monitor for concurrent logins from different IPs |
| Attacker spoofs another tenant's `organization_id` in JWT | Tenant isolation | Low (JWT is signed) | Critical | JWT signature verification on every request; RLS provides second line of defense |
| Attacker forges member phone number in WhatsApp message | Identity | Medium (requires Meta account) | High | Phone number sourced from Meta webhook payload (server-side); OTP verification on first interaction |

### T — Tampering

| Threat | Asset | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| SQL injection via user-controlled input | Database | Medium (common attack) | Critical | Parameterized queries exclusively; string interpolation in SQL is prohibited by code review and ESLint rule |
| Tenant context injection via crafted request | RLS isolation | Low | Critical | Tenant context set only by `TenantContextMiddleware`; never from user input; RLS provides backup isolation |
| Audit log tampering | Audit trail | Low | High | INSERT-only RLS policy on `audit_logs`; exported to write-once cold storage monthly |
| WhatsApp message content manipulation | Workflow data | Medium | Medium | Messages are validated and parsed server-side; raw content stored immutably before processing |

### R — Repudiation

| Threat | Asset | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Member denies submitting a workflow | Audit trail | High (common in disputes) | High | Immutable audit log with WhatsApp phone identity, IP address, timestamp, and message content hash |
| Agent denies taking an action | AI agent accountability | Medium | High | All agent actions logged with `actor_type='agent'`, full decision context, and human confirmation where required |
| Admin denies approving an action | Governance trail | Medium | High | Approval decisions logged with actor ID, timestamp, and the exact payload they approved |

### I — Information Disclosure

| Threat | Asset | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Cross-tenant data leakage via missing WHERE clause | All tenant data | Medium (developer error) | Critical | RLS enforces isolation at DB level; automated cross-tenant isolation test required before any migration |
| PII in application logs | Member data | High (developer error) | High | Structured logging with field-level redaction for PII fields; log auditing in CI |
| API error responses expose stack traces or internal paths | System internals | High in dev, medium in prod | Medium | Production error handler returns generic messages; stack traces in logs only |
| WhatsApp access token exposure | Tenant WhatsApp access | Medium | High | Tokens stored encrypted; never returned in API responses; never logged |
| Anthropic API key exposure | AI capability | Medium | Medium | Key in AWS Secrets Manager; rotated quarterly; never in logs or responses |

### D — Denial of Service

| Threat | Asset | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| WhatsApp message flood (one org) | Platform capacity | Medium | Medium | Per-tenant rate limiting; async processing decouples webhook response from processing |
| WhatsApp message flood across all orgs | Platform capacity | Low | High | Cloudflare DDoS protection; per-IP rate limiting at API gateway; auto-scaling API pods |
| BullMQ queue exhaustion | Worker capacity | Medium | Medium | Queue depth monitoring; dead-letter queue for stuck jobs; worker autoscaling |
| Large file upload DoS | Storage/memory | Low | Medium | File size limits (50MB default); streaming uploads; virus scan before processing |

### E — Elevation of Privilege

| Threat | Asset | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Horizontal privilege escalation (member accesses another member's data) | Member data | Medium | High | RBAC enforced on every route; `PermissionGuard` validates `resource.organization_id === request.tenantId` |
| Vertical privilege escalation (member → org admin) | Admin access | Medium | Critical | Role assignments validated server-side; JWT contains role claims that are validated against DB on sensitive operations |
| Agent action exceeds delegated permissions | Organizational data | Medium | High | `AutomationGovernanceGuard` validates agent permissions before every action; agents cannot exceed their role's permission matrix |
| Prompt injection via WhatsApp message | AI agent runtime | High (easy to attempt) | Medium | Agent inputs are structured data, not raw text prompts; user content is sandboxed in `payload` field, not injected into system prompts |

---

## High-Priority Threat Summary

| Priority | Threat | Status |
|---|---|---|
| P0 | Cross-tenant data leakage | Mitigated by RLS + automated isolation test |
| P0 | SQL injection | Mitigated by parameterized queries + ESLint rule + code review |
| P0 | Webhook spoofing | Mitigated by HMAC signature validation |
| P1 | JWT token theft | Mitigated by short expiry + revocation |
| P1 | Agent privilege escalation | Mitigated by GovernanceGuard |
| P1 | Vertical privilege escalation | Mitigated by RBAC + server-side role validation |
| P2 | Prompt injection | Partially mitigated — needs structured input validation before Agent OS ships |
| P2 | Log PII exposure | Mitigated by log redaction — requires developer discipline + audit |

---

## Out of Scope (Current Version)

- Physical security of data centers (AWS responsibility)
- Meta/WhatsApp infrastructure security
- End-user device security
- Supply chain attacks on npm packages (mitigated by lockfile + Dependabot)

---

## Threat Model Review Schedule

This threat model must be reviewed:
- Before each major feature launch (Agent OS, Knowledge OS, multi-region)
- After any security incident
- Annually as a baseline review
