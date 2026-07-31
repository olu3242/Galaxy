import type { Pool } from 'pg';
import type { TenantSummary, TenantStatus } from '../types.js';

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  member_count: string;
  workflow_count: string;
  created_at: string;
}

function mapTenantSummary(row: OrganizationRow): TenantSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as TenantStatus,
    plan: row.plan,
    memberCount: parseInt(row.member_count, 10),
    workflowCount: parseInt(row.workflow_count, 10),
    createdAt: row.created_at,
  };
}

export class TenantAdminService {
  constructor(private readonly pool: Pool) {}

  async listAllTenants(opts?: {
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

    const result = await this.pool.query<OrganizationRow>(
      `SELECT o.id, o.name, o.slug,
              COALESCE(o.status, 'active') as status,
              COALESCE(o.tier, 'free') as plan,
              o.created_at,
              (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) as member_count,
              (SELECT COUNT(*) FROM workflows w WHERE w.organization_id = o.id) as workflow_count
       FROM organizations o
       ${whereClause}
       ORDER BY o.created_at DESC${limitClause}${offsetClause}`,
      params,
    );

    return result.rows.map(mapTenantSummary);
  }

  async getTenant(tenantId: string): Promise<TenantSummary | null> {
    const result = await this.pool.query<OrganizationRow>(
      `SELECT o.id, o.name, o.slug,
              COALESCE(o.status, 'active') as status,
              COALESCE(o.tier, 'free') as plan,
              o.created_at,
              (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) as member_count,
              (SELECT COUNT(*) FROM workflows w WHERE w.organization_id = o.id) as workflow_count
       FROM organizations o
       WHERE o.id = $1`,
      [tenantId],
    );

    return result.rows[0] ? mapTenantSummary(result.rows[0]) : null;
  }

  async suspendTenant(tenantId: string): Promise<TenantSummary | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      plan: string;
      created_at: string;
    }>(
      `UPDATE organizations SET status = 'suspended', updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, COALESCE(status, 'suspended') as status, COALESCE(tier, 'free') as plan, created_at`,
      [tenantId],
    );

    if (!result.rows[0]) return null;

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      slug: result.rows[0].slug,
      status: result.rows[0].status as TenantStatus,
      plan: result.rows[0].plan,
      memberCount: 0,
      workflowCount: 0,
      createdAt: result.rows[0].created_at,
    };
  }

  async reinstateTenant(tenantId: string): Promise<TenantSummary | null> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      plan: string;
      created_at: string;
    }>(
      `UPDATE organizations SET status = 'active', updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, COALESCE(status, 'active') as status, COALESCE(tier, 'free') as plan, created_at`,
      [tenantId],
    );

    if (!result.rows[0]) return null;

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      slug: result.rows[0].slug,
      status: result.rows[0].status as TenantStatus,
      plan: result.rows[0].plan,
      memberCount: 0,
      workflowCount: 0,
      createdAt: result.rows[0].created_at,
    };
  }

  async getTenantUsageSummary(tenantId: string): Promise<Record<string, number>> {
    const [members, workflows, agents, events] = await Promise.all([
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM memberships WHERE organization_id = $1`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM workflows WHERE organization_id = $1`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM agents WHERE organization_id = $1`,
        [tenantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM events WHERE organization_id = $1`,
        [tenantId],
      ),
    ]);

    return {
      members: parseInt(members.rows[0]?.count ?? '0', 10),
      workflows: parseInt(workflows.rows[0]?.count ?? '0', 10),
      agents: parseInt(agents.rows[0]?.count ?? '0', 10),
      events: parseInt(events.rows[0]?.count ?? '0', 10),
    };
  }
}
