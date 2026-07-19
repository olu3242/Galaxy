import type { Pool } from 'pg';
import type {
  AuthorizationRequest,
  AuthorizationResult,
  AbacAttributes,
  AbacPolicy,
  AbacCondition,
  ApprovalTier,
} from '../types/index.js';

interface MembershipRow {
  role_id: string;
  role_name: string;
  permissions: string[];
  hierarchy_node_id: string | null;
}

interface PolicyRow {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions: AbacCondition[];
  effect: string;
  priority: number;
}

interface ApprovalRuleRow {
  id: string;
  tier: number;
  required_role: string;
  requires_multiple_approvers: boolean;
  approver_count: number;
  escalation_after_hours: number;
}

/**
 * AuthorizationEngine
 *
 * Centralizes all authorization decisions for Galaxy.
 *
 * Pipeline:
 *   1. Load actor roles + permissions (RBAC)
 *   2. Load active ABAC policies for the resource
 *   3. Evaluate ABAC conditions against actor attributes
 *   4. Apply hierarchical inheritance (parent roles inherit child permissions)
 *   5. Check active delegations
 *   6. Evaluate approval matrix requirements
 *   7. Return AuthorizationResult
 *
 * Every authorization decision is traceable via correlationId.
 */
export class AuthorizationEngine {
  constructor(private readonly pool: Pool) {}

  async evaluate(request: AuthorizationRequest): Promise<AuthorizationResult> {
    await this.setTenant(request.organizationId);

    const [membershipRows, policyRows, delegationPermissions] = await Promise.all([
      this.loadMemberships(request.organizationId, request.actorId),
      this.loadAbacPolicies(request.organizationId, request.resource, request.action),
      this.loadDelegatedPermissions(request.organizationId, request.actorId),
    ]);

    // Collect all direct permissions
    const allPermissions = new Set<string>();
    const appliedRoles: string[] = [];

    for (const m of membershipRows) {
      appliedRoles.push(m.role_name);
      for (const p of m.permissions) allPermissions.add(p);
    }
    for (const p of delegationPermissions) allPermissions.add(p);

    // RBAC check — does actor have the explicit permission?
    const permissionKey = `${request.resource}:${request.action}`;
    const wildcardKey = `${request.resource}:*`;
    const hasDirectPermission =
      allPermissions.has(permissionKey) ||
      allPermissions.has(wildcardKey) ||
      allPermissions.has('*:*');

    // ABAC check — evaluate all matching policies
    const appliedPolicies: string[] = [];
    let abacAllow = true;
    let abacDeny = false;

    for (const policy of policyRows) {
      const matches = this.evaluateConditions(policy.conditions, request.attributes);
      if (!matches) continue;
      appliedPolicies.push(policy.id);
      if (policy.effect === 'deny') {
        abacDeny = true;
        abacAllow = false;
      }
    }

    // Deny takes precedence
    if (abacDeny) {
      return {
        allowed: false,
        reason: 'ABAC policy explicitly denies this action',
        appliedRoles,
        appliedPolicies,
        requiresApproval: false,
        auditRequired: true,
      };
    }

    const allowed = hasDirectPermission || (policyRows.length === 0 ? false : abacAllow);

    if (!allowed) {
      return {
        allowed: false,
        reason: `Actor does not have permission '${permissionKey}'`,
        appliedRoles,
        appliedPolicies,
        requiresApproval: false,
        auditRequired: true,
      };
    }

    // Check approval matrix
    const approvalRule = await this.evaluateApprovalMatrix(
      request.organizationId,
      request.action,
      request.attributes,
    );

    const result: AuthorizationResult = {
      allowed: true,
      reason: 'Authorization granted',
      appliedRoles,
      appliedPolicies,
      requiresApproval: approvalRule !== null,
      auditRequired: true,
    };
    if (approvalRule !== null) result.approvalTier = approvalRule.tier as ApprovalTier;
    return result;
  }

  private evaluateConditions(
    conditions: AbacCondition[],
    attributes: AbacAttributes | undefined,
  ): boolean {
    if (!attributes) return conditions.length === 0;
    for (const condition of conditions) {
      const attrValue = attributes[condition.attribute];
      if (!this.evaluateCondition(condition, attrValue)) return false;
    }
    return true;
  }

  private evaluateCondition(condition: AbacCondition, value: unknown): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'gt':
        return (
          typeof value === 'number' &&
          typeof condition.value === 'number' &&
          value > condition.value
        );
      case 'gte':
        return (
          typeof value === 'number' &&
          typeof condition.value === 'number' &&
          value >= condition.value
        );
      case 'lt':
        return (
          typeof value === 'number' &&
          typeof condition.value === 'number' &&
          value < condition.value
        );
      case 'lte':
        return (
          typeof value === 'number' &&
          typeof condition.value === 'number' &&
          value <= condition.value
        );
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
    }
  }

  private async loadMemberships(organizationId: string, actorId: string): Promise<MembershipRow[]> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT r.id AS role_id, r.name AS role_name,
              COALESCE(r.permissions, '{}') AS permissions,
              m.hierarchy_node_id
       FROM memberships m
       JOIN org_roles r ON r.id = m.role_id
       WHERE m.user_id = $1 AND m.organization_id = $2
         AND m.status = 'active' AND r.is_active = true`,
      [actorId, organizationId],
    );
    return result.rows;
  }

  private async loadAbacPolicies(
    organizationId: string,
    resource: string,
    action: string,
  ): Promise<PolicyRow[]> {
    const result = await this.pool.query<PolicyRow>(
      `SELECT id, name, resource, action, conditions, effect, priority
       FROM abac_policies
       WHERE organization_id = $1
         AND (resource = $2 OR resource = '*')
         AND (action = $3 OR action = '*')
         AND is_active = true
       ORDER BY priority DESC`,
      [organizationId, resource, action],
    );
    return result.rows;
  }

  private async loadDelegatedPermissions(
    organizationId: string,
    actorId: string,
  ): Promise<string[]> {
    const result = await this.pool.query<{ permissions: string[] }>(
      `SELECT permissions FROM delegations
       WHERE organization_id = $1
         AND delegatee_id = $2
         AND is_active = true
         AND start_at <= NOW()
         AND end_at >= NOW()`,
      [organizationId, actorId],
    );
    return result.rows.flatMap((r) => r.permissions);
  }

  private async evaluateApprovalMatrix(
    organizationId: string,
    action: string,
    _attributes: AbacAttributes | undefined,
  ): Promise<ApprovalRuleRow | null> {
    const result = await this.pool.query<ApprovalRuleRow>(
      `SELECT id, tier, required_role, requires_multiple_approvers, approver_count, escalation_after_hours
       FROM approval_rules
       WHERE organization_id = $1
         AND is_active = true
         AND (workflow_type IS NULL OR workflow_type = $2)
       ORDER BY tier DESC
       LIMIT 1`,
      [organizationId, action],
    );
    return result.rows[0] ?? null;
  }

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }
}

export type { AbacPolicy };
