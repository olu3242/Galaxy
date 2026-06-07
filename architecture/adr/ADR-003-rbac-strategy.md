# ADR-003: RBAC Strategy

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-06-07 |
| **Review Date** | Sprint 2 |
| **Deciders** | CTO, Platform Lead Engineer |
| **Related Documents** | `security/RBAC.md`, `architecture/DOMAIN_MODEL.md` |

---

## Context

Galaxy serves multi-tenant organizations with hierarchical structures: departments contain teams, teams contain members. Different actors within the same organization need different levels of access:

- A field team member should only see their own tasks and conversations
- A department head should manage their department's workflows and members
- An executive needs read-across-org visibility for strategic oversight
- An auditor needs read-only access to audit logs without any operational access
- AI agents act on behalf of members and need their own permission constraints

Additionally, the Agent OS introduces a new category of actor (automated agents) whose write actions require governance validation independent of the standard RBAC check.

Key context factors:

1. **Hierarchical org structure:** Organizations contain departments; departments contain teams; teams contain members. Role authority must align with this hierarchy.

2. **Agent actions require governance beyond RBAC:** Standard RBAC determines whether an actor is allowed to perform an action type. Agent governance determines the impact of a specific action instance and whether human approval is required. These are orthogonal concerns.

3. **Multi-tenancy:** Roles must be scoped to prevent cross-tenant privilege. An Organization Owner in Tenant A must have no authority in Tenant B.

4. **Implementation simplicity:** The MVP team is small. The RBAC model must be implementable, testable, and auditable without excessive complexity.

5. **Auditability:** Every permission evaluation — especially denials — must be logged for compliance.

---

## Decision

**We adopt a flat RBAC model with hierarchical scope resolution, covering four scope levels: platform → organization → department → team.**

### Role Definition

Eight roles are defined in `security/RBAC.md`. Roles are either platform-defined (system roles, seeded on migration) or organization-custom (created by the Organization Owner). The role set is intentionally small to keep the permission matrix understandable.

### Permission Strings

Permissions follow the pattern `action:resource` (e.g., `manage:workflows`, `view:analytics`). The full permission catalog is defined in `security/RBAC.md`. Permissions are assigned to roles via a `role_permissions` join table.

### Scope Resolution

Role assignments carry a scope reference: `{ type: 'org' | 'department' | 'team', id: UUID }`. When `RbacEnforcementService` evaluates a permission check, it:

1. Retrieves all role assignments for the actor within the requesting organization
2. For each role assignment, checks if the resource being accessed falls within the assignment's scope
3. A department-scoped `dept:head` role grants authority over all resources within that department, including its teams
4. An org-scoped `org:owner` role grants authority over all resources within the organization

This produces a hierarchical permission evaluation without the complexity of a full graph-based authorization system.

### Agent Governance as a Separate Concern

Agent write actions go through two gates:
1. **RBAC gate:** Does the agent session's delegated scope allow this action type at all?
2. **Governance gate:** What is the impact tier of this specific action instance? (AutomationGovernanceGuard)

These two gates are independent. An agent may have RBAC permission to create a task (`manage:workflows`) but the AutomationGovernanceGuard may still route the specific task creation to human approval if the impact tier is 3 or 4.

---

## Consequences

### Positive

- **Simplicity:** Eight roles and a fixed permission catalog are understandable to both engineers and organization administrators. An Organization Owner can reason about what each role grants.
- **Hierarchical scope without graph complexity:** The scope-resolution approach provides the organizational hierarchy behavior (dept head manages their department) without the implementation complexity of a full relationship-based authorization system.
- **Auditability:** Every permission evaluation is a discrete, loggable event. Denials are recorded in the audit log.
- **Clear extension path:** New permissions can be added to the catalog and assigned to roles without changing the evaluation model. New scopes (e.g., project-level) can be added if needed.
- **Agent governance separation:** Keeping RBAC and impact-tier governance as separate gates makes each concern independently testable and auditable.

### Negative

- **Scope granularity limits:** The flat RBAC model cannot express fine-grained resource-instance permissions (e.g., "Member A can edit Workflow X but not Workflow Y"). Such cases require application-layer ownership checks in addition to RBAC.
- **Role proliferation risk:** If organization admins can create custom roles, the number of roles can grow over time, making auditing harder. Mitigation: limit custom roles to organization scope; require approval from Platform Lead for changes to system roles.
- **Scope overlap edge cases:** A member who is both a `dept:head` in Department A and a `org:member` at org scope has additive permissions. The permission evaluation must correctly union all applicable role assignments. Test coverage for overlap cases is required.

---

## Alternatives Considered

### Attribute-Based Access Control (ABAC)

**Approach:** Permissions are evaluated based on attributes of the actor, resource, action, and environment at runtime. Policies are expressed as rules over these attributes.

**Rejected because:** ABAC provides maximum expressiveness but significant implementation complexity. Writing, testing, and auditing ABAC policies requires specialized tooling (e.g., OPA) and expertise. At MVP, the permission requirements fit cleanly within a role-based model. ABAC can be adopted for specific edge cases (e.g., data sensitivity labels on knowledge documents) without replacing the core RBAC model.

### Relationship-Based Access Control (ReBAC)

**Approach:** Permissions are derived from the graph of relationships between entities (e.g., "you can read this workflow because you are a member of a team that is assigned to a department that owns this workflow"). Google Zanzibar is the canonical reference implementation.

**Rejected because:** ReBAC is highly expressive and naturally handles hierarchical organizational structures, but the implementation complexity and operational overhead (a separate authorization database and query engine) is not justified at MVP. The hierarchical scope resolution in our flat RBAC model provides similar behavior for the organizational hierarchy use cases without the infrastructure overhead.

### Pure Access Control Lists (ACL)

**Approach:** Per-resource ACLs defining exactly which members can perform which actions on each resource instance.

**Rejected because:** ACLs are operationally expensive at scale (every resource has its own list), cannot easily express "department head manages entire department" without denormalization, and are difficult to audit at the organization level. They are also difficult to change when roles or org structure change.

---

## Review Notes

At Sprint 2, this decision will be reviewed to assess:
1. Whether the eight roles cover all organizational use cases encountered during onboarding
2. Whether any organizations have requested fine-grained resource-instance permissions that the flat RBAC model cannot express
3. Whether scope overlap edge cases have caused any permission evaluation bugs in testing
4. Whether the agent governance integration with RBAC is working as designed
