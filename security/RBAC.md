# Galaxy Role-Based Access Control (RBAC)

This document defines the platform's RBAC model, including role definitions, the permission matrix, the data access matrix, and administrative boundary rules.

---

## Role Definitions

Galaxy uses a flat RBAC model with hierarchical scope. Roles are assigned to members at a specific scope level: **platform**, **organization**, **department**, or **team**. A role assigned at a broader scope implicitly includes the permissions of that role within all narrower scopes contained within it.

### 1. Platform Admin

| Field              | Value                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `platform:admin`                                                                                                                                                                                                                                                                                                                                  |
| **Scope**          | Platform (cross-tenant)                                                                                                                                                                                                                                                                                                                           |
| **Description**    | Anthropic/Galaxy operator with full platform visibility. Can provision organizations, manage subscription tiers, view cross-tenant platform health metrics, and perform emergency interventions. Does not have access to individual organization's operational data unless explicitly required for incident response, which must be audit-logged. |
| **Who can assign** | Only other Platform Admins; cannot be self-assigned.                                                                                                                                                                                                                                                                                              |

---

### 2. Organization Owner

| Field              | Value                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `org:owner`                                                                                                                                                                                                                                  |
| **Scope**          | Organization                                                                                                                                                                                                                                 |
| **Description**    | The founding member or designated owner of a single organization. Has full administrative control within their organization, including managing members, roles, billing settings, and integrations. Cannot access other organizations' data. |
| **Who can assign** | Platform Admin (initial assignment on org creation); another Organization Owner within the same org.                                                                                                                                         |

---

### 3. Executive

| Field              | Value                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `org:executive`                                                                                                                                                                                                                                                      |
| **Scope**          | Organization                                                                                                                                                                                                                                                         |
| **Description**    | C-suite or senior leadership with read access to all operational data, analytics, and audit logs within their organization. Can view all workflows, approve high-impact requests, and access executive analytics dashboards. Cannot modify RBAC or billing settings. |
| **Who can assign** | Organization Owner.                                                                                                                                                                                                                                                  |

---

### 4. Department Head

| Field              | Value                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `dept:head`                                                                                                                                                                                                            |
| **Scope**          | Department                                                                                                                                                                                                             |
| **Description**    | Leads a specific department. Has full CRUD access to workflows, tasks, approvals, and members within their department. Can manage team leads within their department. Has analytics access scoped to their department. |
| **Who can assign** | Organization Owner.                                                                                                                                                                                                    |

---

### 5. Manager

| Field              | Value                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `dept:manager`                                                                                                                                                                                                      |
| **Scope**          | Department                                                                                                                                                                                                          |
| **Description**    | Manages operations within a department. Can create and manage workflow definitions, assign tasks, approve requests within their scope, and view department analytics. Cannot manage RBAC or create new departments. |
| **Who can assign** | Department Head, Organization Owner.                                                                                                                                                                                |

---

### 6. Team Lead

| Field              | Value                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `team:lead`                                                                                                                                                                                             |
| **Scope**          | Team                                                                                                                                                                                                    |
| **Description**    | Leads a specific team within a department. Can manage team tasks, view team analytics, and delegate approvals within their team. Has read access to department-level workflows that involve their team. |
| **Who can assign** | Department Head, Manager, Organization Owner.                                                                                                                                                           |

---

### 7. Member

| Field              | Value                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `org:member`                                                                                                                                                                                                                            |
| **Scope**          | Organization (default)                                                                                                                                                                                                                  |
| **Description**    | Standard organizational member. Can initiate workflows they have been granted access to, complete assigned tasks, respond to approval requests directed at them, and view their own data. This is the default role for all new members. |
| **Who can assign** | Automatically assigned on member creation. Can be supplemented (not replaced) with higher-scope roles by Department Head and above.                                                                                                     |

---

### 8. Auditor

| Field              | Value                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**           | `org:auditor`                                                                                                                                                                                                                                                                                     |
| **Scope**          | Organization                                                                                                                                                                                                                                                                                      |
| **Description**    | Read-only access to audit logs, workflow histories, and approval records for compliance and forensics purposes. Cannot modify any data. Cannot trigger workflows or approve requests. This role is typically assigned to internal compliance officers or external auditors during review periods. |
| **Who can assign** | Organization Owner.                                                                                                                                                                                                                                                                               |

---

## Permission Matrix

The following matrix defines which permissions are granted to each role. `Y` = granted, `N` = not granted, `Scoped` = granted within the role's assigned scope only.

| Permission             | Platform Admin | Org Owner | Executive | Dept Head | Manager | Team Lead | Member | Auditor |
| ---------------------- | :------------: | :-------: | :-------: | :-------: | :-----: | :-------: | :----: | :-----: |
| `manage:organizations` |       Y        |     N     |     N     |     N     |    N    |     N     |   N    |    N    |
| `manage:members`       |       Y        |     Y     |     N     |  Scoped   | Scoped  |     N     |   N    |    N    |
| `manage:roles`         |       Y        |     Y     |     N     |     N     |    N    |     N     |   N    |    N    |
| `manage:workflows`     |       Y        |     Y     |     N     |  Scoped   | Scoped  |     N     |   N    |    N    |
| `manage:approvals`     |       Y        |     Y     |     Y     |  Scoped   | Scoped  |  Scoped   |   N    |    N    |
| `view:analytics`       |       Y        |     Y     |     Y     |  Scoped   | Scoped  |  Scoped   |   N    |    N    |
| `manage:agents`        |       Y        |     Y     |     N     |     N     |    N    |     N     |   N    |    N    |
| `manage:audit`         |       Y        |     N     |     N     |     N     |    N    |     N     |   N    |    N    |
| `view:audit`           |       Y        |     Y     |     Y     |     N     |    N    |     N     |   N    |    Y    |
| `manage:knowledge`     |       Y        |     Y     |     N     |  Scoped   | Scoped  |     N     |   N    |    N    |
| `manage:integrations`  |       Y        |     Y     |     N     |     N     |    N    |     N     |   N    |    N    |
| `manage:billing`       |       Y        |     Y     |     N     |     N     |    N    |     N     |   N    |    N    |

### Notes

- **`manage:organizations`**: Create, suspend, update, or delete organization records. Platform Admin only.
- **`manage:members`**: Invite, update, deactivate members. Organization Owner does this org-wide; Department Head and Manager do this within their scope.
- **`manage:roles`**: Assign and revoke roles. Organization Owner and Platform Admin only.
- **`manage:workflows`**: Create, edit, publish, and archive workflow definitions. Scoped roles apply to their department only.
- **`manage:approvals`**: Respond to approval requests. Scoped roles can only respond to approvals within their assigned scope.
- **`view:analytics`**: Access analytics dashboards. Scoped roles see only their department or team's data.
- **`manage:agents`**: Configure agent capabilities, tool permissions, and governance policies. Organization Owner and Platform Admin only.
- **`manage:audit`**: Platform Admin only — ability to run cross-tenant audit queries and manage audit retention.
- **`view:audit`**: Read access to audit log entries within the actor's tenant scope. Executive can view all org audit entries; Auditor has read-only access to audit logs.
- **`manage:knowledge`**: Create, publish, archive knowledge documents. Scoped roles manage knowledge within their department.
- **`manage:integrations`**: Configure WhatsApp WABA, webhooks, and external connectors.
- **`manage:billing`**: Manage subscription, payment methods, and usage limits.

---

## Data Access Matrix

This matrix shows the read/write access level for each role on key entity types. Values: **RW** = read + write, **R** = read only, **Scoped-RW** = read+write within scope, **Scoped-R** = read within scope, **Own** = own records only, **None** = no access.

| Entity              | Platform Admin | Org Owner | Executive | Dept Head |  Manager  | Team Lead |    Member     | Auditor |
| ------------------- | :------------: | :-------: | :-------: | :-------: | :-------: | :-------: | :-----------: | :-----: |
| organizations       |       RW       |     R     |     R     |     R     |     R     |     R     |       R       |    R    |
| departments         |       RW       |    RW     |     R     | Scoped-RW | Scoped-R  | Scoped-R  |      Own      |  None   |
| teams               |       RW       |    RW     |     R     | Scoped-RW | Scoped-RW | Scoped-RW |      Own      |  None   |
| members             |       RW       |    RW     |     R     | Scoped-RW | Scoped-R  | Scoped-R  |      Own      |  None   |
| roles               |       RW       |    RW     |     R     |     R     |     R     |     R     |       R       |    R    |
| permissions         |       R        |     R     |     R     |     R     |     R     |     R     |       R       |    R    |
| tasks               |       RW       |    RW     |     R     | Scoped-RW | Scoped-RW | Scoped-RW |      Own      |  None   |
| approvals           |       RW       |    RW     | Scoped-RW | Scoped-RW | Scoped-RW | Scoped-RW |      Own      |    R    |
| workflows           |       RW       |    RW     |     R     | Scoped-RW | Scoped-RW | Scoped-R  |   Scoped-R    |    R    |
| workflow_runs       |       RW       |    RW     |     R     | Scoped-R  | Scoped-R  | Scoped-R  |      Own      |    R    |
| events              |       R        |   None    |   None    |   None    |   None    |   None    |     None      |  None   |
| audit_logs          |       R        |     R     |     R     |   None    |   None    |   None    |     None      |    R    |
| notifications       |       RW       |     R     |   None    | Scoped-R  |   None    |   None    |      Own      |  None   |
| messages            |       RW       |   None    |   None    |   None    |   None    |   None    |      Own      |  None   |
| knowledge_documents |       RW       |    RW     |     R     | Scoped-RW | Scoped-RW | Scoped-R  | R (published) |    R    |
| agent_actions       |       RW       |     R     |     R     | Scoped-R  | Scoped-R  |   None    |      Own      |    R    |
| ai_insights         |       RW       |    RW     |     R     | Scoped-RW | Scoped-R  |   None    |     None      |    R    |

---

## Administrative Boundaries

### Platform Admin Boundaries

The Platform Admin role operates at the platform level and is the only role that can:

- Provision new organizations and assign initial Organization Owners
- Suspend or delete organizations
- Manage platform-level system roles and permission definitions
- Run cross-tenant audit queries (all such queries are themselves audit-logged)
- Access the DLQ management console for all queues
- Trigger emergency data exports for legal/compliance purposes

Platform Admin access to an organization's operational data (members, workflows, messages) is **prohibited** during normal operations and is only permitted during declared incidents. All such access must be logged with a mandatory justification field in the audit log.

### Organization Owner Boundaries

The Organization Owner role is the highest scope within a single tenant. They can:

- Invite and manage all members within their organization
- Assign and revoke all roles within their organization (except Platform Admin)
- Configure WABA integration settings
- Manage billing and subscription
- View all audit logs within their organization
- Configure agent capabilities and governance policies

Organization Owners **cannot**:

- Access data of other organizations
- Promote themselves to Platform Admin
- Delete or modify audit log entries

### Department Head Boundaries

The Department Head role's authority is bounded by their assigned department. They can manage members, workflows, and approvals within their department, including all teams within it. They cannot:

- Access data or workflows of other departments (unless cross-department workflows explicitly include them)
- Assign roles at the organization scope
- Manage billing or WABA integration

### Scope Inheritance

When a member holds a `dept:head` role on Department A, they automatically hold all permissions that a `dept:manager` or `team:lead` would have for any team within Department A. There is no need to assign redundant lower-scope roles. This inheritance is enforced by the `RbacEnforcementService` during permission evaluation.
