# Galaxy Security Governance

This document defines the security governance structure, policy review process, vulnerability management, incident response playbook, pre-launch security checklist, and ongoing security controls for the Galaxy Loop OS platform.

---

## Security Governance Structure

### Security Ownership

| Role                          | Security Responsibility                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Founding Engineer / CTO**   | Ultimate security accountability; approves security architecture decisions; signs off on ADRs with security implications          |
| **Platform Lead Engineer**    | Day-to-day security owner; triages vulnerabilities; chairs security review for each sprint; owns RBAC and RLS implementation      |
| **Engineering Team**          | Implements security controls; participates in code review with security lens; responsible for not introducing new vulnerabilities |
| **External Auditor (future)** | Annual penetration test and SOC 2 audit engagement                                                                                |

### Security Decision Process

Security decisions are categorized by impact and follow the appropriate decision path:

| Decision Type                        | Owner               | Process                                                                  |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------ |
| Architecture-level security decision | CTO + Platform Lead | ADR required; reviewed before implementation begins                      |
| New permission or RBAC change        | Platform Lead       | Security review PR checklist item; cross-tenant isolation test must pass |
| Dependency with known CVE            | Platform Lead       | Triage within 24 hours; remediation per SLA below                        |
| Incident declaration                 | Platform Lead       | Incident response playbook activates; CTO notified within 1 hour         |
| Schema migration                     | Engineering Team    | Cross-tenant isolation test must pass in CI; Platform Lead approves      |

---

## Policy Review Cadence

| Policy Document                                            | Review Frequency                  | Owner               |
| ---------------------------------------------------------- | --------------------------------- | ------------------- |
| Security Governance (this document)                        | Quarterly                         | Platform Lead       |
| RBAC Model (`security/RBAC.md`)                            | Each sprint where roles change    | Platform Lead       |
| Tenant Isolation (`security/TENANT_ISOLATION.md`)          | Each sprint where schema changes  | Platform Lead       |
| Audit Model (`security/AUDIT_MODEL.md`)                    | Quarterly                         | Platform Lead       |
| Threat Model (`docs/security/THREAT_MODEL.md`)             | Before each major version release | CTO + Platform Lead |
| Secrets Management (`docs/security/SECRETS_MANAGEMENT.md`) | Quarterly                         | Platform Lead       |

Any security incident triggers an out-of-band review of the relevant policies within 5 business days of the incident postmortem.

---

## Vulnerability Management Process

### Discovery Channels

1. **Automated:** `pnpm audit` runs on every CI build and reports CVEs in production dependencies
2. **Automated:** GitHub Dependabot PRs for dependency updates with known CVEs
3. **Automated:** CodeQL analysis on every PR targeting `main` or `develop`
4. **Automated:** gitleaks pre-commit hook and CI scan for secret leakage
5. **External:** Responsible disclosure via `security@galaxy.app` (see `docs/security/SECURITY.md`)
6. **Internal:** Engineering team member discovers a vulnerability during development or code review

### Severity Classification

| Severity     | CVSS Score | Definition                                                               |
| ------------ | ---------- | ------------------------------------------------------------------------ |
| **Critical** | 9.0–10.0   | Remote code execution, authentication bypass, cross-tenant data exposure |
| **High**     | 7.0–8.9    | Privilege escalation, SQL injection potential, significant data exposure |
| **Medium**   | 4.0–6.9    | Information disclosure, CSRF, limited scope data access                  |
| **Low**      | 0.1–3.9    | Minor information leakage, low-risk configuration issues                 |

### Remediation SLA

| Severity     | Triage SLA      | Remediation SLA | Deployment SLA                                           |
| ------------ | --------------- | --------------- | -------------------------------------------------------- |
| **Critical** | 2 hours         | 24 hours        | Immediate (emergency deploy)                             |
| **High**     | 24 hours        | 7 days          | Next scheduled deploy or emergency if actively exploited |
| **Medium**   | 5 business days | 30 days         | Next sprint release                                      |
| **Low**      | 2 weeks         | 90 days         | Next available sprint                                    |

### Triage Process

1. **Discovery:** Vulnerability reported or detected.
2. **Initial Assessment:** Platform Lead reviews within the triage SLA. Assigns severity based on the classification table above.
3. **Impact Analysis:** Determine affected systems, tenant data at risk, and whether exploitation is currently possible.
4. **Containment (if active):** If the vulnerability is being actively exploited, initiate the Incident Response Playbook immediately.
5. **Fix Development:** Engineering creates a fix on a `fix/<ticket>-<slug>` branch. Fix must include a regression test.
6. **Security Review:** Platform Lead reviews the fix specifically for the security property being restored.
7. **Deployment:** Fix is deployed per the Deployment SLA. For Critical/High, a security advisory is communicated to affected organization owners if data may have been exposed.
8. **Verification:** After deployment, verify the fix resolves the vulnerability (automated test must pass).
9. **Post-fix ADR update (if architectural):** If the fix requires an architectural change, the relevant ADR is updated.

---

## Incident Response Playbook

### Phase 1: Detect

**Triggers for incident declaration:**

- `governance.audit.integrity_violation` event fires
- Cross-tenant data access anomaly detected by audit tripwires
- Security alert from CodeQL, gitleaks, or dependency scanner with Critical severity
- External security researcher reports a Critical or High vulnerability
- Member or organization reports suspicious activity
- Automated monitoring detects anomalous query patterns

**Detection actions:**

1. Platform Lead is paged via on-call alert.
2. Platform Lead reviews the alert and determines if an incident should be declared.
3. If declared: a named incident is created in the incident tracker with a severity level and a unique `incident_id`.
4. CTO is notified within 1 hour of declaration.
5. A `governance.audit.recorded` entry with category `admin` and severity `critical` is written with the incident declaration.

---

### Phase 2: Contain

**Goal:** Stop the bleeding. Limit the scope of the incident. Do not destroy evidence.

**Actions by incident type:**

**Cross-tenant data exposure:**

1. Identify the affected organizations (A exposed to B).
2. Revoke all active JWTs for the affected member(s) if the exposure was via a compromised credential.
3. If RLS misconfiguration: disable the affected query path or table access at the API layer immediately (feature flag or deploy).
4. Do not attempt to delete or modify the incorrectly exposed data — preserve it as evidence.
5. Notify the affected organization owners within 1 hour.

**Authentication bypass:**

1. Rotate the JWT signing key immediately (via Secrets Manager rotation).
2. All active sessions are immediately invalidated.
3. Force re-authentication for all members.
4. Identify how many sessions may have been active under the bypass.

**Secret leakage (committed to repository):**

1. Rotate the leaked secret immediately in AWS Secrets Manager.
2. If the secret was a WABA token, notify Meta and request a new token.
3. Scrub the secret from git history using `git filter-repo` (coordinated with team to avoid rebase conflicts).
4. Audit all systems that may have used the leaked secret.

**Compromised dependency (supply chain attack):**

1. Remove or pin the affected dependency version immediately.
2. Identify any production systems running the compromised version.
3. Assess whether the malicious code was executed and what data it could have accessed.

---

### Phase 3: Eradicate

**Goal:** Remove the root cause. Ensure the vulnerability no longer exists in any form.

**Actions:**

1. Develop and test a fix for the root cause (not just the symptom).
2. Review all code paths that share the same vulnerability pattern — fix all instances, not just the reported one.
3. Add a regression test that would have caught this issue before it reached production.
4. Update the affected policy document (RBAC, Tenant Isolation, Audit Model, etc.) if the incident revealed a gap.
5. Review the Threat Model for related attack vectors.
6. Deploy the fix with emergency release process if severity is Critical/High.

---

### Phase 4: Recover

**Goal:** Restore normal operations with confidence.

**Actions:**

1. Verify the fix is deployed and the regression test is passing in production.
2. Restore any disabled query paths or feature flags.
3. Re-enable affected organization access if it was suspended during containment.
4. Confirm with affected organizations that service is restored.
5. Run the full cross-tenant isolation test suite against production (via read-replica) to verify isolation integrity.
6. Monitor anomaly detection for 72 hours post-recovery for signs of re-exploitation.

---

### Phase 5: Postmortem

**Goal:** Learn and prevent. No blame; systemic focus.

**Timeline:** Postmortem must be completed within 5 business days of recovery.

**Postmortem document must include:**

1. Incident timeline (detection → containment → eradication → recovery, with timestamps)
2. Root cause analysis (5-Whys or equivalent)
3. Impact assessment (organizations affected, data exposed, duration of exposure)
4. What worked well in the response
5. What did not work well
6. Action items with owners and due dates (at minimum: a regression test, a policy update, and a process change)
7. Notification status (were affected customers notified? were regulators notified if required?)

The postmortem document is stored in `docs/security/incidents/INCIDENT-{YYYY-MM-DD}-{slug}.md` and referenced in the audit log with the incident ID.

---

## Pre-Launch Security Checklist

The following checklist must be completed and signed off by the Platform Lead before any production launch or major version release.

### OWASP Top 10 (2021)

| OWASP Risk                            | Galaxy Control                                                                                  | Status   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| A01 — Broken Access Control           | RBAC + RLS enforced; cross-tenant isolation test in CI                                          | Required |
| A02 — Cryptographic Failures          | JWT RS256; HMAC-SHA256 webhook verification; TLS 1.2+ enforced; secrets in Secrets Manager      | Required |
| A03 — Injection                       | Parameterized queries everywhere; Zod input validation; no string interpolation in SQL          | Required |
| A04 — Insecure Design                 | Threat model reviewed; security ADRs in place; agent governance guard required for writes       | Required |
| A05 — Security Misconfiguration       | No default credentials; security headers (HSTS, CSP, X-Frame-Options) on web; RLS on all tables | Required |
| A06 — Vulnerable Components           | `pnpm audit` green; Dependabot enabled; no high/critical CVEs in production deps                | Required |
| A07 — Authentication Failures         | JWT expiry enforced; token revocation on logout; rate limiting on auth endpoints                | Required |
| A08 — Software and Data Integrity     | gitleaks secret scanning; CodeQL in CI; signed audit log exports                                | Required |
| A09 — Security Logging and Monitoring | Structured audit logging for all categories; DLQ alerting; SLA breach alerting                  | Required |
| A10 — SSRF                            | Outbound HTTP calls restricted to allowlisted domains (Meta API, AWS); WABA URLs validated      | Required |

### RLS Validation

- [ ] Cross-tenant isolation test passes for all tables in CI
- [ ] New tables added in this release have RLS policies
- [ ] `audit_logs` INSERT-only policy verified (attempt UPDATE and DELETE in integration test — both must fail)
- [ ] `set_config` is always called via parameterized query, never via string interpolation

### Secret Scanning

- [ ] gitleaks scan passes on the release branch
- [ ] No secrets in `.env` files committed to the repository
- [ ] All new secrets are in AWS Secrets Manager with correct IAM policies
- [ ] `.env.example` is updated if new variables are required

### Dependency Audit

- [ ] `pnpm audit --prod` returns no high or critical CVEs
- [ ] All Dependabot PRs for high/critical CVEs are merged before launch

### Authentication and Authorization

- [ ] JWT expiry is set to an appropriate value (access token: 15 minutes, refresh token: 7 days)
- [ ] All new API routes have explicit permission guards
- [ ] WhatsApp webhook signature verification test passes
- [ ] RBAC permission matrix updated for any new permissions added in this release

### Agent Governance

- [ ] All agent tools registered with correct impact tier classifications
- [ ] AutomationGovernanceGuard integration test passes for Tier 3–4 actions
- [ ] Human-in-the-loop flow tested end-to-end for a Tier 3 action

---

## Ongoing Security Controls

### Dependency Audit

`pnpm audit` is executed on every CI run. PRs that introduce new high or critical CVEs are blocked from merging. Dependabot is configured to open PRs for high and critical CVEs within 24 hours of disclosure.

### CodeQL Analysis

GitHub CodeQL analysis runs on every PR targeting `main` or `develop`. The following query suites are enabled:

- `security-and-quality` (TypeScript/JavaScript)
- `security-extended` (TypeScript/JavaScript)

CodeQL findings at `error` severity block the PR merge. `warning` severity findings require acknowledgment from the Platform Lead.

### gitleaks Secret Scanning

gitleaks is configured as a pre-commit hook (via `husky`) and as a CI step. It scans all staged files before commit and all changed files in a PR. Any detected secret blocks the commit or PR merge. The `.gitleaks.toml` configuration is maintained in the repository root.

### Penetration Testing Schedule

| Test Type                                          | Frequency       | Provider                  |
| -------------------------------------------------- | --------------- | ------------------------- |
| Internal security review                           | Every sprint    | Platform Lead             |
| External penetration test (web application)        | Annually        | Third-party security firm |
| External penetration test (API)                    | Annually        | Third-party security firm |
| Red team exercise (social engineering + technical) | Every 18 months | Third-party security firm |

Penetration test reports are stored in `docs/security/pentest/` (not committed to the public repository). Findings are triaged and remediated per the vulnerability management SLA.

### Security Headers

The web dashboard (`apps/web`) and API (`apps/api`) enforce the following HTTP security headers:

| Header                      | Value                                          |
| --------------------------- | ---------------------------------------------- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Content-Security-Policy`   | Defined per-app to restrict script sources     |
| `X-Frame-Options`           | `DENY`                                         |
| `X-Content-Type-Options`    | `nosniff`                                      |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              |
| `Permissions-Policy`        | Restricts camera, microphone, geolocation      |

### Rate Limiting

API rate limits are enforced per-tenant and per-endpoint using a Redis sliding window counter:

| Endpoint Class                    | Limit                                          |
| --------------------------------- | ---------------------------------------------- |
| Auth endpoints (`/api/v1/auth/*`) | 10 requests per minute per IP                  |
| Webhook receiver                  | 1000 requests per minute per `phone_number_id` |
| General API                       | 300 requests per minute per tenant             |
| Analytics queries                 | 60 requests per minute per tenant              |
