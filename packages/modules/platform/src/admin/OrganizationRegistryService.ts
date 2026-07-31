import type { Pool } from 'pg';

export interface OrgRegistryEntry {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  memberCount: number;
  createdAt: string;
}

export interface OrgStats {
  total: number;
  active: number;
  suspended: number;
  trial: number;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  member_count: string;
  created_at: string;
}

interface StatsRow {
  total: string;
  active: string;
  suspended: string;
  trial: string;
}

export class OrganizationRegistryService {
  constructor(private readonly pool: Pool) {}

  async searchOrganizations(query: string, limit = 20): Promise<OrgRegistryEntry[]> {
    const result = await this.pool.query<OrgRow>(
      `SELECT o.id, o.name, o.slug,
              COALESCE(o.status, 'active') AS status,
              COALESCE(o.tier, 'free') AS plan,
              o.created_at,
              (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) AS member_count
       FROM organizations o
       WHERE o.name ILIKE $1 OR o.slug ILIKE $1
       ORDER BY o.name
       LIMIT $2`,
      [`%${query}%`, limit],
    );
    return result.rows.map((r) => this.mapEntry(r));
  }

  async getOrgStats(): Promise<OrgStats> {
    const result = await this.pool.query<StatsRow>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE COALESCE(status,'active') = 'active') AS active,
         COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
         COUNT(*) FILTER (WHERE status = 'trial') AS trial
       FROM organizations`,
    );
    const row = result.rows[0];
    if (!row) return { total: 0, active: 0, suspended: 0, trial: 0 };
    return {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      suspended: parseInt(row.suspended, 10),
      trial: parseInt(row.trial, 10),
    };
  }

  async listOrganizations(opts?: { limit?: number; offset?: number }): Promise<OrgRegistryEntry[]> {
    const params: unknown[] = [];
    let idx = 1;
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);
    const offset = opts?.offset !== undefined ? ` OFFSET $${String(idx++)}` : '';
    if (opts?.offset !== undefined) params.push(opts.offset);

    const result = await this.pool.query<OrgRow>(
      `SELECT o.id, o.name, o.slug,
              COALESCE(o.status, 'active') AS status,
              COALESCE(o.tier, 'free') AS plan,
              o.created_at,
              (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) AS member_count
       FROM organizations o
       ORDER BY o.created_at DESC${limit}${offset}`,
      params,
    );
    return result.rows.map((r) => this.mapEntry(r));
  }

  private mapEntry(row: OrgRow): OrgRegistryEntry {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan: row.plan,
      memberCount: parseInt(row.member_count, 10),
      createdAt: row.created_at,
    };
  }
}
