# Sprint 1 — Core Platform

**Sprint:** 1
**Duration:** Weeks 3–6
**Goal:** One working workflow via WhatsApp, end to end
**Branch:** `sprint/1-core-platform`

---

## Objective

Deliver the minimum viable slice: a member sends "LEAVE" to their organisation's WhatsApp number, the leave request workflow completes (submit → manager approval → member notification), and the outcome is fully audited.

---

## Deliverables

### Identity OS

- [x] Organization CRUD — `routes/organizations.ts` + `modules/identity/src/services/OrganizationService.ts`
- [x] Department + team structure — `routes/departments.ts`, `routes/teams.ts`
- [x] Member invitation via WhatsApp link — `modules/identity/src/services/MemberService.ts`
- [x] RBAC engine — `routes/roles.ts`, `modules/identity/src/services/RoleService.ts`
- [x] WhatsApp phone → member identity mapping — `middleware/auth.ts` (phone hash → participantId)
- [x] JWT authentication middleware — `middleware/auth.ts`
- [x] Tenant context middleware (RLS-safe) — `middleware/tenant.ts`

### Communication OS

- [x] WhatsApp webhook handler (signature validation) — `routes/webhooks-whatsapp.ts`
- [x] Message Event Factory (intent classification) — `modules/conversation/src/services/ConversationIntelligenceService.ts`
- [x] Outbound message engine — `modules/communication/src/providers/WhatsAppProvider.ts`
- [x] Phone number → organization routing — `routes/webhooks-whatsapp.ts`

### Workflow OS

- [x] Workflow definition schema — `modules/workflow/src/types.ts`
- [x] Leave Request workflow template — `db/seeds/workflow-templates.ts`
- [x] Workflow state machine — `modules/workflow/src/services/WorkflowEngineService.ts`
- [x] SLA tracking — `WorkflowEngineService.ts` (`sla_due_at`, `escalated_at`)
- [x] Approver notification via WhatsApp — `modules/workflow/src/services/WorkflowEngineService.ts`

### Infrastructure

- [x] Database schema v1 — migrations `001`–`015` (organizations, members, roles, workflows)
- [x] RLS policies — migration `008_enable_rls.ts`
- [x] Cross-tenant isolation tests — `apps/api/src/__tests__/rls-isolation.test.ts`
- [x] API server scaffold — `apps/api/src/index.ts` (Fastify, 53+ routes)
- [x] Worker scaffold — `apps/worker/src/index.ts` (BullMQ)
- [x] Structured logging (Pino) — configured in `index.ts` with field redaction
- [x] Health check endpoint — `GET /health` in `index.ts`

---

## Exit Criteria

- [x] Member can send "LEAVE" to WhatsApp → leave request workflow created
- [x] Workflow completes: submit → manager approval → member notification
- [x] Zero cross-tenant RLS test failures (verified in `rls-isolation.test.ts`)
- [x] CI green

---

## Status: **COMPLETE**
