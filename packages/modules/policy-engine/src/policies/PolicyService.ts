import type { Pool } from 'pg';
import type { Policy, PolicyEnforcementMode, PolicyStatus } from '../types.js';

interface PolicyRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: string;
  enforcement_mode: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function rowToPolicy(row: PolicyRow): Policy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: row.status as PolicyStatus,
    enforcementMode: row.enforcement_mode as PolicyEnforcementMode,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.description !== null ? { description: row.description } : {}),
  };
}

export class PolicyService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createPolicy(
    orgId: string,
    name: string,
    description: string | undefined,
    enforcementMode: PolicyEnforcementMode,
  ): Promise<Policy> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<PolicyRow>(
      `INSERT INTO policies (organization_id, name, description, enforcement_mode)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orgId, name, description ?? null, enforcementMode],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create policy');
    return rowToPolicy(row);
  }

  async getPolicy(orgId: string, policyId: string): Promise<Policy> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<PolicyRow>(
      'SELECT * FROM policies WHERE organization_id = $1 AND id = $2',
      [orgId, policyId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Policy not found');
    return rowToPolicy(row);
  }

  async listPolicies(orgId: string): Promise<Policy[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<PolicyRow>(
      'SELECT * FROM policies WHERE organization_id = $1 ORDER BY created_at DESC',
      [orgId],
    );
    return result.rows.map(rowToPolicy);
  }

  async activatePolicy(orgId: string, policyId: string): Promise<Policy> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<PolicyRow>(
      `UPDATE policies SET status = 'active', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, policyId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Policy not found');
    return rowToPolicy(row);
  }

  async deactivatePolicy(orgId: string, policyId: string): Promise<Policy> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<PolicyRow>(
      `UPDATE policies SET status = 'inactive', updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, policyId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Policy not found');
    return rowToPolicy(row);
  }
}
