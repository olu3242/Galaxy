# ADR-004: WhatsApp Integration via Meta Cloud API (One WABA Per Tenant)

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Engineering Foundation
**Tags:** whatsapp, integration, architecture, multi-tenancy

---

## Context

Galaxy's primary interaction channel is WhatsApp. Members send messages to their organization's WhatsApp number; Galaxy processes those messages and sends responses.

The Meta WhatsApp Business API has two structural patterns for multi-tenant use:
1. **Shared WABA:** Galaxy operates a single WhatsApp Business Account; all tenant organizations share Galaxy's phone number(s)
2. **Per-tenant WABA:** Each Galaxy customer organization registers their own WhatsApp Business Account with their own phone number(s); Galaxy manages these on their behalf

The choice has major implications for: organization identity (phone number), message limits, compliance, data residency, and onboarding UX.

## Decision

Each Galaxy tenant organization will have its **own WhatsApp Business Account (WABA)** with its own dedicated phone number. Galaxy acts as a **Business Solution Provider (BSP)** and manages tenant WABAs via the Meta Business Manager API.

Galaxy's platform WABA is used only for system-level notifications (e.g., billing alerts to organization admins).

Tenant WABA credentials (Phone Number ID, Access Token) are stored encrypted in the `organization_whatsapp_credentials` table, scoped to the tenant.

## Rationale

### Options Considered

| Option | Pros | Cons |
|---|---|---|
| Shared WABA (Galaxy's number) | Simpler setup; one set of credentials | Members message a generic number — no org identity; shared rate limits across all tenants; compliance risk (one org's violation affects all) |
| Per-tenant WABA | Org's own number; independent limits; org controls their identity | More complex onboarding; Galaxy must be approved as BSP |

### Chosen Option: Per-Tenant WABA

Organizations use WhatsApp because they want members to message **their** number ("+254 700 CHURCH", "+27 60 NGO-NAME"). A shared Galaxy number destroys this. Additionally, Meta's messaging tiers apply per WABA — if one tenant sends spam, a shared WABA would rate-limit all tenants simultaneously.

## Consequences

### Positive
- Each organization maintains their own WhatsApp identity
- Rate limits are per-organization, not shared
- One org's policy violation does not affect other orgs
- Organizations can migrate away from Galaxy and keep their phone number

### Negative / Trade-offs
- Galaxy must apply for and maintain Meta BSP status
- Onboarding flow requires organization admin to complete Meta's WABA verification process
- Each tenant's WABA token expires and must be refreshed — token rotation system required
- Per-tenant credentials add complexity to the WhatsApp client implementation

## Implementation Notes

### Webhook Architecture

Galaxy registers a single webhook endpoint with Meta:
```
POST /api/v1/webhooks/whatsapp
```

Meta routes messages for ALL tenant WABAs to this single endpoint. The tenant is resolved from the `Phone Number ID` in the webhook payload.

### Tenant Resolution from Webhook

```typescript
// Resolve tenant from the phone number ID in the webhook payload
const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
const org = await orgRepo.findByPhoneNumberId(phoneNumberId);
```

### Webhook Signature Validation (MANDATORY)

The platform-level `WHATSAPP_APP_SECRET` is used to validate ALL incoming webhooks:

```typescript
// ✅ Always validate before processing
const sig = request.headers['x-hub-signature-256'] as string;
const expected = 'sha256=' + crypto
  .createHmac('sha256', env.WHATSAPP_APP_SECRET)
  .update(request.rawBody as Buffer)
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  throw new ForbiddenError('Invalid webhook signature');
}
```

Raw body must be preserved (do not parse JSON before signature check).

### Credential Storage

Tenant WABA credentials are stored in a dedicated table with column-level encryption:

```sql
CREATE TABLE organization_whatsapp_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  phone_number_id   VARCHAR(50) NOT NULL,
  waba_id           VARCHAR(50) NOT NULL,
  access_token_enc  BYTEA NOT NULL,  -- encrypted with org-specific key
  token_expires_at  TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

Access tokens are never stored in plaintext. Use AWS Secrets Manager or column-level encryption (pgcrypto).

## Review Trigger

Revisit if Meta changes BSP requirements, introduces new API versions incompatible with this architecture, or if onboarding conversion rate for WABA verification falls below acceptable threshold.
