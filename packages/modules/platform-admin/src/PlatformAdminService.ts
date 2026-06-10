import type { Pool } from 'pg';
import type { TenantSummary, TenantStatus } from './types.js';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  member_count: string;
  workflow_count: string;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  organization_id: string;
  role: string;
  created_at: string;
}

export interface UserDirectoryEntry {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  createdAt: string;
}

export interface PlatformHealthSummary {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
  healthScore: number;
  measuredAt: string;
}

export class PlatformAdminService {
  constructor(private readonly pool: Pool) {}

  async getOrgDirectory(opts?: {
    status?: TenantStatus;
    limit?: number;
    offset?: number;
  }): Promise<TenantSummary[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.status !== undefined) {
      conditions.push(`o.status = $${String(idx)}`);
      params.push(opts.status);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts?.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
      idx++;
    }
    const offsetClause = opts?.offset !== undefined ? ` OFFSET $${String(idx)}` : '';
    if (opts?.offset !== undefined) {
      params.push(opts.offset);
    }

    const result = await this.pool.query<OrgRow>(
      `SELECT o.id, o.name, o.slug, o.status, o.plan,
              COUNT(DISTINCT m.id)::text AS member_count,
              COUNT(DISTINCT w.id)::text AS workflow_count,
              o.created_at
       FROM organizations o
       LEFT JOIN members m ON m.organization_id = o.id
       LEFT JOIN workflows w ON w.organization_id = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at DESC${limitClause}${offsetClause}`,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status as TenantStatus,
      plan: row.plan,
      memberCount: parseInt(row.member_count, 10),
      workflowCount: parseInt(row.workflow_count, 10),
      createdAt: row.created_at,
    }));
  }

  async getUserDirectory(opts?: {
    organizationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<UserDirectoryEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.organizationId !== undefined) {
      conditions.push(`organization_id = $${String(idx)}`);
      params.push(opts.organizationId);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = opts?.limit !== undefined ? ` LIMIT $${String(idx)}` : '';
    if (opts?.limit !== undefined) {
      params.push(opts.limit);
      idx++;
    }
    const offsetClause = opts?.offset !== undefined ? ` OFFSET $${String(idx)}` : '';
    if (opts?.offset !== undefined) {
      params.push(opts.offset);
    }

    const result = await this.pool.query<UserRow>(
      `SELECT id, email, organization_id, role, created_at
       FROM members
       ${whereClause}
       ORDER BY created_at DESC${limitClause}${offsetClause}`,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      organizationId: row.organization_id,
      role: row.role,
      createdAt: row.created_at,
    }));
  }

  async getPlatformHealthSummary(): Promise<PlatformHealthSummary> {
    const result = await this.pool.query<{
      total_orgs: string;
      active_orgs: string;
      suspended_orgs: string;
      total_users: string;
    }>(
      `SELECT
         COUNT(DISTINCT o.id)::text AS total_orgs,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'active')::text AS active_orgs,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'suspended')::text AS suspended_orgs,
         COUNT(DISTINCT m.id)::text AS total_users
       FROM organizations o
       LEFT JOIN members m ON m.organization_id = o.id`,
    );

    const row = result.rows[0];
    const totalOrgs = parseInt(row?.total_orgs ?? '0', 10);
    const activeOrgs = parseInt(row?.active_orgs ?? '0', 10);
    const suspendedOrgs = parseInt(row?.suspended_orgs ?? '0', 10);
    const totalUsers = parseInt(row?.total_users ?? '0', 10);
    const healthScore = totalOrgs > 0 ? Math.round((activeOrgs / totalOrgs) * 100) : 100;

    return {
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      totalUsers,
      healthScore,
      measuredAt: new Date().toISOString(),
    };
  }
}
