# Galaxy Loop OS — Delivery Roadmap

**Version:** 1.0
**Last Updated:** 2026-06-07

---

## Delivery Philosophy

Galaxy is built as a **vertically complete slice first**. Rather than building all 9 OS modules to partial completion simultaneously, each sprint delivers one end-to-end flow that is production-safe before moving to the next.

The minimum viable slice is:
```
Member sends WhatsApp message
  → Webhook receives and validates
  → Intent classified
  → Workflow instantiated
  → Approval flow completes
  → Loop verification requested
  → Outcome recorded
```

Everything else is additive.

---

## Sprint 0 — Foundation (Current)

**Duration:** 2 weeks
**Goal:** Zero to production-grade repository structure

Deliverables:
- [x] Monorepo foundation (pnpm + Turborepo)
- [x] TypeScript configuration (strict mode)
- [x] ESLint + Prettier
- [x] Shared packages: types, config, utils
- [x] CI/CD pipeline (GitHub Actions)
- [x] Security pipeline (CodeQL, secret scanning, dependency audit)
- [x] Architecture Decision Records (ADR-001 through ADR-005)
- [x] Security governance documents
- [x] Engineering process documents
- [x] Docker Compose (local infrastructure)
- [x] Environment configuration
- [x] CLAUDE.md (AI assistant instructions)
- [ ] pnpm lockfile (requires pnpm install run)
- [ ] husky git hooks

---

## Sprint 1 — Core Platform (Weeks 3–6)

**Goal:** One working workflow via WhatsApp, end to end

### Identity OS (Core)
- Organization CRUD (create, read, update)
- Department + team structure
- Member invitation via WhatsApp link
- RBAC engine (roles, permissions, permission check)
- WhatsApp phone → member identity mapping
- JWT authentication middleware
- Tenant context middleware (RLS-safe)

### Communication OS (Core)
- WhatsApp webhook handler (signature validation)
- Message Event Factory (intent classification — basic)
- Outbound message engine (text + interactive buttons)
- Phone number → organization routing

### Workflow OS (Core — Leave Request only)
- Workflow definition schema
- Leave Request workflow template
- Workflow state machine (submitted → approved/rejected → completed)
- SLA tracking
- Approver notification via WhatsApp

### Infrastructure
- Database schema v1 (organizations, members, roles, permissions, workflows, workflow_instances)
- Migration system
- RLS policies + cross-tenant isolation tests
- API server scaffold (Fastify + routes)
- Worker scaffold (BullMQ)
- Structured logging (Pino)
- Health check endpoint

**Exit Criteria:**
- A member can send "LEAVE" to their organization's WhatsApp number
- The leave request workflow completes (submit → manager approval → member notification)
- Zero cross-tenant RLS test failures
- CI green

---

## Sprint 2 — Loop OS + Governance (Weeks 7–10)

**Goal:** Every workflow has verification and feedback; governance enforced

### Loop OS (Verification Phase)
- Loop instance lifecycle (created → verifying → collecting_feedback → completed)
- Verification engine: manager confirmation, photo evidence
- WhatsApp follow-up automation (SLA breach reminders)
- Feedback collection (1–5 star via WhatsApp)
- Outcome score recording

### Governance OS (Core)
- Policy engine (approval limits, escalation paths)
- Multi-level approval chain management
- Compliance check on workflow completion
- Immutable audit log (all workflow operations)
- Escalation: SLA breach → department head notification

### People OS (Core)
- 360° member record
- Member profile + status management
- Activity timeline (last active, response rate)
- Attendance check-in via WhatsApp

### Workflow OS (Additional Templates)
- Expense Approval workflow (amount-based routing)
- Incident Report workflow

**Exit Criteria:**
- Leave request workflow has Loop verification + feedback
- SLA breaches auto-escalate
- Compliance check runs on every completed workflow
- Audit log captures all operations

---

## Sprint 3 — Analytics + Broadcast + Onboarding (Weeks 11–14)

**Goal:** Organizations can see what's happening and communicate at scale

### Analytics OS (MVP)
- Executive dashboard (org health score, workflow velocity)
- Operations dashboard (active workflows, SLA compliance)
- Real-time dashboard updates via WebSocket

### Communication OS (Broadcast)
- Broadcast engine (mass messaging to org/department/group)
- Rate limiting per WABA tier
- Delivery tracking (sent/delivered/read)
- Message template library

### Identity OS (Onboarding)
- Organization onboarding flow (WABA setup wizard)
- Member bulk invite
- Department/team setup

### Mission Control (Web Dashboard — basic)
- Organization overview
- Active workflows list
- Member directory
- Broadcast composer

**Exit Criteria:**
- Org admin can see live org health on web dashboard
- Admin can broadcast to all members via web
- Onboarding takes < 30 minutes for a new organization

---

## V1 — Full Platform (Month 4–6)

**Goal:** All 9 industry templates, full Loop OS, 5 AI agents

### OS Modules
- All 9 industry templates (Church, NGO, School, Cooperative, Political, Association, Creator, Public Safety, Government)
- Full Loop OS: Learning Phase + Optimization Phase
- Agent OS: Executive, HR, Finance, Operations, Compliance agents
- Knowledge OS: Document ingestion, RAG queries, semantic search
- Full Analytics OS: all 7 dashboard types
- ABAC authorization layer

### Infrastructure
- Auth0 SSO integration
- Kafka event bus (replacing BullMQ for event distribution at scale)
- Elasticsearch for audit log search
- Email channel (SendGrid)
- pgvector embeddings pipeline

**Exit Criteria:**
- 200 organizations onboarded
- 5,000 active members
- 50,000 messages/day capacity tested
- $50K MRR

---

## Enterprise (Month 7–12)

- All 7 agents + custom agent builder
- Loop SDK + Marketplace
- Multi-org management console
- Custom workflow DSL
- SAML 2.0 / OIDC enterprise SSO
- Government/air-gapped deployment option
- White-label option
- Dedicated schema per enterprise tenant
- Multi-region data residency (EU, Africa, Asia)

---

## Success Metrics

| Phase | Orgs | Members | Messages/Day | Completion Rate | MRR |
|---|---|---|---|---|---|
| MVP (Sprint 1–3) | 25 | 500 | 1,000 | 70% | $5K |
| V1 (Month 4–6) | 200 | 5,000 | 50,000 | 85% | $50K |
| Enterprise (Year 1) | 1,000 | 50,000 | 500,000 | 90% | $500K |
