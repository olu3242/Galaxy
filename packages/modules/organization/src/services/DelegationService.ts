import type { Pool } from 'pg';
import type { Delegation, CreateDelegationInput } from '../types/index.js';

export class DelegationService {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateDelegationInput): Promise<Delegation> {
    await this.setTenant(input.organizationId);

    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      delegator_id: string;
      delegatee_id: string;
      role_id: string | null;
      permissions: string[];
      reason: string;
      start_at: string;
      end_at: string;
      is_active: boolean;
      approved_by: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO delegations
         (organization_id, delegator_id, delegatee_id, role_id, permissions, reason, start_at, end_at, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.organizationId,
        input.delegatorId,
        input.delegateeId,
        input.roleId ?? null,
        input.permissions,
        input.reason,
        input.startAt,
        input.endAt,
        input.approvedBy ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create delegation');
    return this.mapRow(row);
  }

  async getActive(organizationId: string, delegateeId: string): Promise<Delegation[]> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      delegator_id: string;
      delegatee_id: string;
      role_id: string | null;
      permissions: string[];
      reason: string;
      start_at: string;
      end_at: string;
      is_active: boolean;
      approved_by: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM delegations
       WHERE organization_id = $1
         AND delegatee_id = $2
         AND is_active = true
         AND start_at <= NOW()
         AND end_at >= NOW()
       ORDER BY created_at DESC`,
      [organizationId, delegateeId],
    );

    return result.rows.map((r) => this.mapRow(r));
  }

  async revoke(organizationId: string, delegationId: string): Promise<void> {
    await this.setTenant(organizationId);

    await this.pool.query(
      `UPDATE delegations SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [delegationId, organizationId],
    );
  }

  async expireStale(organizationId: string): Promise<number> {
    await this.setTenant(organizationId);

    const result = await this.pool.query<{ count: string }>(
      `WITH expired AS (
         UPDATE delegations SET is_active = false, updated_at = NOW()
         WHERE organization_id = $1 AND is_active = true AND end_at < NOW()
         RETURNING id
       )
       SELECT COUNT(*)::text AS count FROM expired`,
      [organizationId],
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private async setTenant(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  private mapRow(row: {
    id: string;
    organization_id: string;
    delegator_id: string;
    delegatee_id: string;
    role_id: string | null;
    permissions: string[];
    reason: string;
    start_at: string;
    end_at: string;
    is_active: boolean;
    approved_by: string | null;
    created_at: string;
    updated_at: string;
  }): Delegation {
    const delegation: Delegation = {
      id: row.id,
      organizationId: row.organization_id,
      delegatorId: row.delegator_id,
      delegateeId: row.delegatee_id,
      permissions: row.permissions,
      reason: row.reason as Delegation['reason'],
      startAt: row.start_at,
      endAt: row.end_at,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.role_id !== null) delegation.roleId = row.role_id;
    if (row.approved_by !== null) delegation.approvedBy = row.approved_by;
    return delegation;
  }
}
