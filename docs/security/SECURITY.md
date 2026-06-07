# Galaxy Security Policy

## Reporting a Vulnerability

**Do not report security vulnerabilities via GitHub issues.**

To report a security vulnerability, email: **security@galaxy.com** (placeholder — update before launch)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested remediation

You will receive an acknowledgement within 48 hours. We commit to:
- Triage within 5 business days
- Regular updates on remediation progress
- Credit in the security advisory (unless you prefer anonymity)
- No legal action against good-faith security researchers

---

## Security Requirements

### Encryption

| Data State | Requirement |
|---|---|
| Data at rest | AES-256 (AWS RDS encryption enabled) |
| Data in transit | TLS 1.3 minimum (TLS 1.2 permitted for legacy clients, 1.0/1.1 prohibited) |
| Secrets at rest | AWS Secrets Manager or column-level encryption (pgcrypto) |
| WhatsApp access tokens | Column-level encryption in database |
| Backup data | Encrypted with same key as primary data |

### Authentication

| Requirement | Standard |
|---|---|
| API authentication | JWT (HS256, 24h expiry), signed with `JWT_SECRET` (minimum 32 bytes) |
| WhatsApp identity | Phone number verified via OTP on first interaction |
| Admin web access | JWT + (V1: MFA via Auth0) |
| Service-to-service | Internal API keys, rotated quarterly |
| Webhook validation | HMAC-SHA256 signature on all WhatsApp webhooks |

### Authorization

- RBAC enforced on every API route via `PermissionGuard`
- Tenant context validated on every database query via RLS
- Agent actions gated by `AutomationGovernanceGuard` impact tier classification
- Admin-only routes require explicit `role:org_admin` or `role:super_admin`

### Input Validation

- All API request bodies validated via Zod schemas before processing
- WhatsApp webhook payloads validated against Meta's schema before processing
- SQL queries use parameterized statements exclusively — string interpolation in queries is PROHIBITED
- File uploads: type validation, size limits, malware scanning (V1)

### Audit Logging

- Every authenticated operation produces an immutable `audit_logs` entry
- Audit log entries are INSERT-only — UPDATE and DELETE are denied by RLS
- Logs include: `actor_type`, `actor_id`, `action`, `resource_type`, `resource_id`, `old_value`, `new_value`, `ip_address`, `correlation_id`
- Audit logs are retained for minimum 7 years (GDPR Article 5 accountability principle)
- Audit logs are exported to tamper-evident cold storage monthly

### Network Security

- Cloudflare WAF sits in front of all public endpoints
- Rate limiting on all API routes (per-tenant, per-IP)
- WhatsApp webhook endpoint: validate signature before any processing; respond 200 immediately (< 100ms), process asynchronously
- Internal services communicate over VPC private subnets — not exposed to public internet
- Database and Redis are not publicly accessible

---

## Security Controls by Component

### API Server (`apps/api`)

- Helmet.js headers (CSP, HSTS, X-Frame-Options, etc.)
- CORS: allow only trusted origins (`API_BASE_URL`, `WEB_BASE_URL`)
- Rate limiting: default 100 req/min per tenant, 10 req/min per IP for auth endpoints
- Request logging: structured JSON, PII fields redacted

### Database (PostgreSQL)

- RLS enabled on all tables (see ADR-003)
- Application connects with least-privilege role (no DDL permissions in production)
- Migration scripts run with a separate migration role
- Superuser access: restricted to DBA, requires MFA + VPN
- Connection pooling: PgBouncer in transaction mode only

### Background Workers (`apps/worker`)

- Workers run in isolated containers with no inbound network access
- Worker Redis connection is write-only to result queues; read-only to job queues
- Workers cannot make outbound HTTP requests except to whitelisted endpoints

### WhatsApp Integration

- All inbound webhooks signature-validated before processing
- Outbound messages use template IDs only (no user-controlled message content in templates)
- Interactive message payloads sanitized before storing
- Phone numbers normalized and validated via libphonenumber before storage

---

## GDPR Compliance

| Right | Implementation |
|---|---|
| Right of access | Admin dashboard exports member data (V1) |
| Right to erasure | Member PII pseudonymized on request; audit logs retain pseudonymized IDs only |
| Right to portability | Data export in JSON format (V1) |
| Data minimization | Profile data collection defined per industry template; no fields beyond necessity |
| Privacy by design | RLS prevents cross-tenant access by architecture, not by policy |

**GDPR vs. Immutable Audit Logs Reconciliation:**
Audit log entries store `actor_id` and `resource_id` as UUIDs. When a member exercises erasure rights, their personal data is pseudonymized in the `members` table; the UUID references in `audit_logs` remain (pointing to a now-anonymized record). The audit log's integrity is preserved; the PII is removed from the referenced record.

---

## Pre-Launch Security Checklist

- [ ] Penetration test completed by independent security firm
- [ ] OWASP Top 10 assessment completed
- [ ] All CRITICAL and HIGH findings from pentest remediated
- [ ] RLS cross-tenant isolation automated test suite passing
- [ ] Secrets rotation procedure documented and tested
- [ ] Incident response runbook completed
- [ ] Data breach notification procedure documented
- [ ] WhatsApp webhook signature validation tested with tampered payloads
- [ ] SQL injection automated scan (e.g., sqlmap) run against staging
- [ ] Authentication bypass tested on all protected routes
- [ ] Rate limiting verified under load

---

## Security Contacts

| Role | Contact |
|---|---|
| Security reports | security@galaxy.com |
| Data protection officer | dpo@galaxy.com |
| Incident response | security@galaxy.com |
