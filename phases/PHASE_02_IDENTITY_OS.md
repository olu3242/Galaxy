# Phase 02: Identity OS

## Objectives

Implement the Identity OS module, which is the security and access foundation for all other OS modules. No other OS module can function correctly without Identity OS providing tenant context, member authentication, and RBAC enforcement. This phase delivers a fully operational multi-tenant identity system with WhatsApp identity linking and RLS-enforced data isolation.

---

## Deliverables

### 1. Organization Management

- Organization CRUD API: `POST /api/v1/organizations`, `GET /api/v1/organizations/:id`, `PATCH /api/v1/organizations/:id`
- Organization provisioning flow: creates the organization record, seeds default system roles, emits `identity.organization.created`
- Organization status management: active, suspended, deleted
- `TenantContextMiddleware` fully operational: resolves `organizationId` from JWT and sets RLS context
- Database migration: `organizations` table with all fields defined in `architecture/DATA_MODEL.md`

### 2. Member Management

- Member CRUD API: `POST /api/v1/members`, `GET /api/v1/members`, `GET /api/v1/members/:id`, `PATCH /api/v1/members/:id`, `DELETE /api/v1/members/:id`
- Member invite flow: create member record, send WhatsApp onboarding message (or email link for web-only members)
- Member status transitions: active → inactive → suspended
- Self-service profile update: `PATCH /api/v1/members/me`
- Database migration: `members` table with RLS policy

### 3. JWT Authentication

- `POST /api/v1/auth/login` — email/password login; returns access token + refresh token
- `POST /api/v1/auth/refresh` — refresh token rotation; invalidates old refresh token
- `POST /api/v1/auth/logout` — invalidates refresh token
- JWT payload includes: `sub` (memberId), `tenantId` (organizationId), `roles` (role slug array), `exp`, `iat`
- RS256 signing with key stored in AWS Secrets Manager
- Access token expiry: 15 minutes. Refresh token expiry: 7 days.
- Failed login attempts: rate-limited (10 attempts per 15 minutes per IP); emits `identity.auth.login_failed` audit event

### 4. WhatsApp Identity Linking

- `POST /api/v1/members/:id/link-phone` — initiates phone verification by sending a 6-digit OTP via WhatsApp
- OTP verification endpoint: `POST /api/v1/members/:id/verify-phone` — validates OTP, links `PhoneIdentity` to member
- OTP stored in Redis with 10-minute TTL
- Verified phone number stored in `members.whatsapp_phone` (E.164 format)
- Phone number uniqueness enforced within organization
- Emits `identity.member.phone_linked` on successful verification

### 5. RBAC Implementation

- Database migrations: `roles`, `permissions`, `role_assignments`, `role_permissions` tables
- System roles seeded on organization creation: `org:owner`, `org:executive`, `dept:head`, `dept:manager`, `team:lead`, `org:member`, `org:auditor`
- `PermissionGuard` Fastify hook: evaluates permission checks against active role assignments
- `RbacEnforcementService`: resolves actor role assignments, evaluates hierarchical scope, returns allow/deny
- `POST /api/v1/role-assignments` — assign a role to a member at a given scope
- `DELETE /api/v1/role-assignments/:id` — revoke a role assignment
- All permission denials logged as `auth` category audit events

### 6. RLS Bootstrap

- RLS policies applied to all tables created in this phase: `members`, `roles`, `role_assignments`, `role_permissions`
- Cross-tenant isolation integration test added to CI
- `withTenantContext` helper used in all database operations
- RLS validation tests confirm Tenant A cannot read Tenant B's members or roles

### 7. Audit Logging

- `audit_logs` table created with INSERT-only RLS policy
- `AuditWriterService` implemented: accepts audit events from any OS module, enqueues to `audit-writer` BullMQ queue
- `AuditWriterProcessor` BullMQ worker: writes audit log entries with hash chaining
- All Identity OS domain events produce audit log entries

---

## Dependencies

- Phase 01 (Foundation) complete: monorepo, CI/CD, shared types, infrastructure
- `GalaxyEvent` envelope finalized in `packages/types`
- `withTenantContext` helper available in `packages/utils`
- Error class hierarchy available in `packages/utils`
- PostgreSQL running locally; Redis running locally
- AWS Secrets Manager configured with JWT signing key secret path

---

## Acceptance Criteria

- [ ] `POST /api/v1/organizations` creates an organization, seeds roles, and emits `identity.organization.created`
- [ ] `POST /api/v1/auth/login` returns a valid JWT for a seeded member
- [ ] JWT contains `sub`, `tenantId`, `roles`, `exp` fields
- [ ] `GET /api/v1/members` with a valid JWT for Tenant A returns only Tenant A's members
- [ ] `GET /api/v1/members` with a valid JWT for Tenant B returns only Tenant B's members (cross-tenant isolation test)
- [ ] A request without a JWT to any protected route returns 401
- [ ] A request with an expired JWT returns 401
- [ ] A member without `manage:members` permission receives 403 on `POST /api/v1/members`
- [ ] Phone OTP flow: member receives WhatsApp OTP, verifies it, and `members.whatsapp_phone` is set
- [ ] Duplicate OTP submission fails after first use
- [ ] `audit_logs` INSERT-only: attempt UPDATE returns an error
- [ ] Cross-tenant isolation test passes for all Identity OS tables
- [ ] `identity.auth.login_failed` is emitted on failed login and recorded in audit log
- [ ] All Identity OS domain events are listed in `architecture/EVENT_FABRIC.md` and are being emitted

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| WhatsApp OTP delivery failure during testing | Medium | Low | Use a test phone number; implement fallback email OTP for early adopters |
| JWT RS256 key management complexity in local dev | Medium | Low | Provide a local dev key pair in `.env.example` with clear instructions |
| RLS policy not applied to a new table | Low | High | Cross-tenant isolation test in CI catches missing policies immediately |
| Role seeding race condition on first organization creation | Low | Medium | Wrap org creation and role seeding in a database transaction |
| Token refresh race condition (two requests simultaneously refreshing) | Low | Medium | Redis-based refresh token locking: new token is only issued if old token is present and valid |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Cross-tenant isolation test | Passes (zero cross-tenant rows returned) |
| JWT authentication | Login + refresh + logout round trip under 300ms p95 |
| RLS coverage | 100% of Identity OS tables have RLS policies |
| Audit log coverage | 100% of Identity OS domain events produce audit log entries |
| Test coverage | Unit tests for all pure functions; integration tests for all API routes |
