# ADR-004: WhatsApp Tenant Model

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-07 |
| **Review Date** | Sprint 4 |
| **Deciders** | CTO, Platform Lead Engineer |
| **Related Documents** | `architecture/SYSTEM_ARCHITECTURE.md`, `security/TENANT_ISOLATION.md` |

---

## Context

Galaxy operates as a WhatsApp Business Solution Provider (BSP), enabling multiple organizations to use WhatsApp as their primary interface for workflow operations, approvals, and reporting. The platform must manage the relationship between WhatsApp Business Accounts (WABAs) and tenant organizations.

Key context factors:

1. **BSP model:** As a BSP, Galaxy manages WhatsApp Business Accounts on behalf of its customer organizations. Each organization's employees communicate with Galaxy through WhatsApp, and Galaxy routes those messages to the correct organizational context.

2. **Webhook routing challenge:** Meta delivers all WhatsApp webhook events to a single registered callback URL for a given WhatsApp App. Galaxy must route each inbound message to the correct tenant without ambiguity.

3. **Message sender privacy:** The `from` field in an inbound message contains the sender's phone number. This is PII and must be handled carefully. The routing mechanism should not depend on parsing sender phone numbers for tenant resolution.

4. **One-to-one employee communication:** Galaxy's model is that organization members interact with their organization's dedicated WhatsApp number. There is no shared "Galaxy number" that multiple organizations use — this would create confusion and undermine the branded experience.

5. **Meta WABA constraints:** A WhatsApp Business Account has a primary phone number. A single WABA can have multiple phone numbers, and a single Meta App can manage multiple WABAs. The routing architecture must work within these constraints.

6. **Template management per org:** WhatsApp message templates must be submitted and approved per WABA. If multiple tenants share a WABA, template namespaces can collide and approval of one org's template could be conflated with another's.

7. **Security:** The tenant routing mechanism must be cryptographically verifiable. If an attacker spoofs a webhook payload with a different `phone_number_id`, they must not be able to route messages to a different tenant.

---

## Decision

**Each organization provisioned on Galaxy receives a dedicated WhatsApp Business Account (WABA) with its own phone number. Webhook routing is performed by matching the `phone_number_id` field in the Meta webhook payload to the organization record.**

### Organization Provisioning Flow

1. When a new organization is provisioned, the Platform Admin configures a WABA for that organization.
2. A `phone_number_id` (unique identifier for the WABA's registered phone number) is recorded in `organizations.waba_phone_number_id`.
3. The WABA access token for the organization is stored in AWS Secrets Manager at `galaxy/waba/{organizationId}`.
4. The `WABAConfig` entity in the Identity OS domain holds the phone_number_id and the Secrets Manager reference.

### Webhook Routing

All Meta webhooks arrive at `POST /api/v1/webhooks/whatsapp`. The routing process:

1. **HMAC verification first:** The `x-hub-signature-256` header is validated against the raw body using `WHATSAPP_APP_SECRET` (the Galaxy platform app secret, not per-org). Invalid signatures are rejected with 403 immediately.

2. **phone_number_id extraction:** The webhook payload's `entry[].changes[].value.metadata.phone_number_id` is extracted.

3. **Tenant lookup:** `WebhookRoutingService` queries `SELECT id, status FROM organizations WHERE waba_phone_number_id = $1` using the extracted `phone_number_id`.

4. **Tenant validation:** If no organization is found, or if the organization's status is not `active`, the webhook is dropped and an alert fires. If found, the `organizationId` is used as the tenant context for all downstream processing.

5. **Job enqueue:** A BullMQ job is enqueued with the full webhook payload, `organizationId`, and a generated `correlationId`. The webhook handler returns `200 OK` immediately (within Meta's timeout window).

### Outbound Messaging

Outbound messages are sent using the per-organization WABA access token retrieved from Secrets Manager. The `MessageDispatchService` resolves the correct token for the tenant before making the Graph API call.

### Template Management

Message templates are managed per-WABA. Each organization's templates are submitted to Meta under their own WABA, preventing template namespace conflicts between organizations.

---

## Consequences

### Positive

- **Unambiguous routing:** `phone_number_id` is a stable, unique identifier that is included in every Meta webhook payload. Routing is deterministic and does not require parsing message content or sender phone numbers.
- **Branded experience:** Each organization has its own WhatsApp number, giving their employees a consistent, organization-branded communication identity (e.g., "HR Bot" with the company's display name).
- **Template isolation:** Organization-specific template approvals are fully isolated. An approval delay or rejection for one org does not affect another.
- **Security clarity:** The HMAC verification is done with the Galaxy platform app secret (one secret, valid for all inbound webhooks). The per-org WABA token is only used for outbound calls. These concerns are cleanly separated.
- **Compliance:** Each organization's message history is scoped to their WABA, simplifying data residency and privacy obligations.

### Negative

- **Phone number provisioning overhead:** Onboarding a new organization requires acquiring and registering a phone number with Meta. This adds latency to the provisioning flow and a per-number cost.
- **WABA management complexity:** Multiple WABAs across many organizations requires tooling to manage token rotation, rate limit monitoring, and usage aggregation at the platform level.
- **Meta BSP agreement requirements:** Operating as a BSP with multiple WABAs requires maintaining a valid BSP agreement with Meta and complying with Meta's policies for each WABA.
- **Phone number provisioning scalability:** As organization count grows into the hundreds or thousands, managing individual WABA configurations requires automation and a self-service provisioning workflow.

---

## Alternatives Considered

### Shared Number with Keyword Routing

**Approach:** All organizations share a single WhatsApp number. Members identify their organization by starting messages with a keyword or code (e.g., "ACME: submit leave request").

**Rejected because:**
- Keyword parsing is fragile and creates a poor user experience (members must remember codes)
- There is no cryptographic way to verify which organization a message belongs to based on content
- All organizations' employees know the single Galaxy number, creating a confused brand experience
- Template management becomes complex — all templates are under a single WABA namespace
- If the shared number's account is suspended or rate-limited, all organizations are affected simultaneously

### Single WABA Multi-Tenant

**Approach:** A single WABA serves all organizations. Routing is determined by sender phone number — the platform maps the sender's phone number to an organization based on which organization the member belongs to.

**Rejected because:**
- Routing by sender phone number requires looking up the sender in the members table before the tenant context is known, creating a chicken-and-egg problem
- If a member's phone number is not yet registered (new member), routing fails
- An attacker could potentially route their messages to a different organization by spoofing a known employee's number (social engineering risk)
- Single WABA means a single rate limit applies across all organizations, creating noisy-neighbor throughput issues
- Template namespaces are shared, creating the conflict and confusion issues described above

---

## Review Notes

At Sprint 4, this decision will be reviewed to assess:
1. Whether the WABA provisioning flow is sufficiently automated for the expected organization onboarding rate
2. Whether Meta BSP compliance requirements have created any operational friction
3. Whether the per-organization token rotation and WABA management tooling is adequate
4. Whether any organizations have requested additional phone numbers (e.g., departmental numbers) within a single WABA
