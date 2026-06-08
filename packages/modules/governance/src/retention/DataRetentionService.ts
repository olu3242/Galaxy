import type { Pool } from 'pg';
import type {
  DataRetentionPolicy,
  CreateDataRetentionPolicyInput,
  RetentionAction,
} from '../types.js';

interface DataRetentionPolicyRow {
  id: string;
  organization_id: string;
  resource_type: string;
  retention_days: number;
  action: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapPolicy(row: DataRetentionPolicyRow): DataRetentionPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    retentionDays: row.retention_days,
    action: row.action as RetentionAction,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RetentionEnforcementResult {
  organizationId: string;
  resourceType: string;
  action: RetentionAction;
  recordsAffected: number;
  enforcedAt: string;
}

export class DataRetentionService {
  constructor(private readonly pool: Pool) {}

  async createRetentionPolicy(input: CreateDataRetentionPolicyInput): Promise<DataRetentionPolicy> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);

    const result = await this.pool.query<DataRetentionPolicyRow>(
      `INSERT INTO data_retention_policies
        (organization_id, resource_type, retention_days, action, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        input.resourceType,
        input.retentionDays,
        input.action,
        input.createdBy,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO data_retention_policies returned no row');
    return mapPolicy(row);
  }

  async getRetentionPolicy(
    organizationId: string,
    policyId: string,
  ): Promise<DataRetentionPolicy | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<DataRetentionPolicyRow>(
      `SELECT * FROM data_retention_policies WHERE id = $1 AND organization_id = $2`,
      [policyId, organizationId],
    );

    return result.rows[0] ? mapPolicy(result.rows[0]) : null;
  }

  async listRetentionPolicies(organizationId: string): Promise<DataRetentionPolicy[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<DataRetentionPolicyRow>(
      `SELECT * FROM data_retention_policies WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId],
    );

    return result.rows.map(mapPolicy);
  }

  async updateRetentionPolicy(
    organizationId: string,
    policyId: string,
    updates: Partial<{ retentionDays: number; action: RetentionAction; isActive: boolean }>,
  ): Promise<DataRetentionPolicy | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.retentionDays !== undefined) {
      sets.push(`retention_days = $${String(idx)}`);
      params.push(updates.retentionDays);
      idx++;
    }
    if (updates.action !== undefined) {
      sets.push(`action = $${String(idx)}`);
      params.push(updates.action);
      idx++;
    }
    if (updates.isActive !== undefined) {
      sets.push(`is_active = $${String(idx)}`);
      params.push(updates.isActive);
      idx++;
    }

    params.push(policyId, organizationId);

    const result = await this.pool.query<DataRetentionPolicyRow>(
      `UPDATE data_retention_policies SET ${sets.join(', ')}
       WHERE id = $${String(idx)} AND organization_id = $${String(idx + 1)}
       RETURNING *`,
      params,
    );

    return result.rows[0] ? mapPolicy(result.rows[0]) : null;
  }

  async enforceRetentionPolicies(organizationId: string): Promise<RetentionEnforcementResult[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const policies = await this.listRetentionPolicies(organizationId);
    const results: RetentionEnforcementResult[] = [];

    for (const policy of policies) {
      if (!policy.isActive) continue;

      const enforcedAt = new Date().toISOString();

      if (policy.action === 'flag') {
        const flagResult = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM audit_logs
           WHERE organization_id = $1
             AND resource_type = $2
             AND created_at < NOW() - ($3 || ' days')::interval`,
          [organizationId, policy.resourceType, String(policy.retentionDays)],
        );
        results.push({
          organizationId,
          resourceType: policy.resourceType,
          action: policy.action,
          recordsAffected: parseInt(flagResult.rows[0]?.count ?? '0', 10),
          enforcedAt,
        });
      } else if (policy.action === 'archive') {
        results.push({
          organizationId,
          resourceType: policy.resourceType,
          action: policy.action,
          recordsAffected: 0,
          enforcedAt,
        });
      }
    }

    return results;
  }
}
