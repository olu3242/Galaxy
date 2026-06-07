# Phase 03: People OS

## Objectives

Implement the People OS module, which models the organizational hierarchy (departments, teams, reporting lines) and provides the data structures that workflow routing, approval escalation, and analytics depend on. This phase also delivers the bulk member import flow via WhatsApp, enabling organizations to onboard their entire team through their preferred communication channel.

---

## Deliverables

### 1. Department Management

- Department CRUD API: `POST /api/v1/departments`, `GET /api/v1/departments`, `GET /api/v1/departments/:id`, `PATCH /api/v1/departments/:id`, `DELETE /api/v1/departments/:id`
- Hierarchical department structure: departments can have a parent department via `parent_department_id`
- Department head assignment: `PATCH /api/v1/departments/:id/head` assigns a member as department head
- Department archiving: archived departments retain their data but are excluded from active hierarchy queries
- Database migration: `departments` table with RLS policy
- Emits: `people.department.created`, `people.department.updated`, `people.department.deleted`

### 2. Team Management

- Team CRUD API: `POST /api/v1/teams`, `GET /api/v1/teams`, `GET /api/v1/teams/:id`, `PATCH /api/v1/teams/:id`, `DELETE /api/v1/teams/:id`
- Team membership management: `POST /api/v1/teams/:id/members`, `DELETE /api/v1/teams/:id/members/:memberId`
- Team lead assignment: `PATCH /api/v1/teams/:id/lead`
- Team must belong to exactly one department
- Database migrations: `teams` table, `team_memberships` table with RLS policies
- Emits: `people.team.created`, `people.team.updated`, `people.team.member_added`, `people.team.member_removed`

### 3. Org Chart

- Org chart query API: `GET /api/v1/org-chart` — returns full organizational hierarchy as a tree structure
- Reporting line query: `GET /api/v1/members/:id/reporting-line` — returns the chain from member to root
- Direct reports query: `GET /api/v1/members/:id/direct-reports` — returns immediate reports
- Manager assignment: `PATCH /api/v1/members/:id/manager` — sets the `manager_id` field
- `OrgChartService` provides: `getReportingLine(memberId)`, `getEscalationTarget(memberId, skipLevels)`, `buildHierarchyTree(organizationId)`
- Emits: `people.org_chart.updated`, `people.member.manager_changed`

### 4. Member Profile Enhancement

- Full profile update API: `PATCH /api/v1/members/:id` now accepts `job_title`, `department_id`, `manager_id`
- Profile picture upload: `POST /api/v1/members/:id/avatar` — accepts image; stores in S3; sets `avatar_url`
- Department assignment: a member can be assigned to a primary department
- Member directory: `GET /api/v1/members` with filter support (by department, team, status)
- Emits: `people.member.profile_updated`

### 5. Bulk Member Import via WhatsApp

- WhatsApp-triggered import flow: a member with `manage:members` permission sends a CSV file or structured table to the organization's WhatsApp number
- `BulkMemberImportService` processes the file:
  - Parses member rows: display_name, email (optional), whatsapp_phone (optional), department, job_title
  - Validates each row against member schema
  - Upserts members: new members are created; existing members (matched by email or phone) are updated
  - Generates an import summary report
- Import result is sent back to the requester via WhatsApp notification
- Failed rows are listed in the summary with error reasons
- Import operations are audit-logged with full before/after snapshots
- Maximum batch size: 500 members per import

### 6. People OS Domain Events

- All People OS domain events defined in `architecture/DOMAIN_MODEL.md` are implemented and emitted
- Events are consumed by the audit writer (all events produce audit log entries)
- Events are published to the `analytics-aggregation` queue for future headcount analytics

---

## Dependencies

- Phase 02 (Identity OS) complete: member records exist, JWT auth works, RBAC enforced
- `TenantContextMiddleware` operational
- `AuditWriterService` operational (from Phase 02)
- Communication OS webhook receiver operational (for WhatsApp import trigger) — if Communication OS is not yet available, the import can be triggered via REST API as a fallback
- File storage (AWS S3) configured for avatar uploads and import file storage

---

## Acceptance Criteria

- [ ] `POST /api/v1/departments` creates a department scoped to the actor's organization
- [ ] Nested department hierarchy: a department with a parent department is returned in the org chart tree
- [ ] `GET /api/v1/org-chart` returns the correct tree structure for the seeded test organization
- [ ] `GET /api/v1/members/:id/reporting-line` returns the chain from member to the org root
- [ ] A Department Head for Department A cannot update a department in Department B (RBAC scope enforcement)
- [ ] Team membership add/remove emits the correct domain events
- [ ] Bulk import: uploading a 10-row CSV creates 10 new members with correct fields
- [ ] Bulk import: uploading a duplicate email row updates the existing member (upsert behavior)
- [ ] Bulk import: invalid rows are excluded and listed in the summary report
- [ ] Bulk import audit log entries contain before/after snapshots for each member upserted
- [ ] Cross-tenant isolation test passes for `departments`, `teams`, `team_memberships` tables
- [ ] All People OS domain events are emitted and recorded in the audit log

---

## Risks

| Risk                                                                          | Likelihood | Impact | Mitigation                                                                                       |
| ----------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| Circular department hierarchy (department A is parent of B, B is parent of A) | Low        | Medium | Add a cycle-detection check in `DepartmentService` before saving a parent assignment             |
| Bulk import file parsing failures (malformed CSV, encoding issues)            | Medium     | Low    | Validate file format before processing; return clear error message with row number               |
| WhatsApp file size limit for import CSV                                       | Low        | Low    | Document the 500-member batch limit; split large imports into multiple batches                   |
| Org chart query performance with deep hierarchies                             | Low        | Medium | Add an index on `members.manager_id`; use a recursive CTE with depth limit                       |
| Avatar upload to S3 failure mid-request                                       | Low        | Low    | Separate avatar upload from profile update; avatar_url is updated only after S3 confirms success |

---

## Success Metrics

| Metric                  | Target                                                       |
| ----------------------- | ------------------------------------------------------------ |
| Org chart query latency | Under 200ms for organizations up to 500 members              |
| Bulk import throughput  | 500 members imported in under 30 seconds                     |
| Cross-tenant isolation  | Passes for all People OS tables                              |
| RBAC scope enforcement  | Department Head cannot access another department's resources |
| Audit log coverage      | 100% of People OS domain events produce audit log entries    |
