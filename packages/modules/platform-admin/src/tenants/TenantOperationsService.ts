import type { Pool } from 'pg';

export type TenantLifecycleStatus =
  | 'provisioning'
  | 'active'
  | 'suspended'
  | 'reactivating'
  | 'archived';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: TenantLifecycleStatus;
  plan: string;
  settings: Record<string, unknown>;
  limits: TenantLimits;
  createdAt: string;
  updatedAt: string;
}

export interface TenantLimits {
  maxMembers: number;
  maxWorkflows: number;
  maxAgents: number;
  apiCallsPerMonth: number;
  storageMb: number;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan: string;
  adminEmail: string;
  limits?: Partial<TenantLimits>;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function defaultLimits(plan: string): TenantLimits {
  if (plan === 'enterprise') {
    return { maxMembers: 10000, maxWorkflows: 10000, maxAgents: 1000, apiCallsPerMonth: 10000000, storageMb: 102400 };
  }
  if (plan === 'professional') {
    return { maxMembers: 500, maxWorkflows: 1000, maxAgents: 50, apiCallsPerMonth: 1000000, storageMb: 10240 };
  }
  if (plan === 'growth') {
    return { maxMembers: 100, maxWorkflows: 200, maxAgents: 10, apiCallsPerMonth: 100000, storageMb: 2048 };
  }
  return { maxMembers: 25, maxWorkflows: 50, maxAgents: 3, apiCallsPerMonth: 10000, storageMb: 512 };
}

export class TenantOperationsService {
  constructor(private readonly pool: Pool) {}

  async createTenant(input: CreateTenantInput): Promise<TenantRecord> {
    const limits = { ...defaultLimits(input.plan), ...input.limits };

    const result = await this.pool.query<OrgRow>(
      `INSERT INTO organizations (name, slug, status, plan, settings)
       VALUES ($1, $2, 'provisioning', $3, $4)
       RETURNING *`,
      [input.name, input.slug, input.plan, JSON.stringify({ adminEmail: input.adminEmail })],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create tenant');

    await this.pool.query(
      `INSERT INTO tenant_limits (organization_id, max_members, max_workflows, max_agents, api_calls_per_month, storage_mb)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id) DO UPDATE SET
         max_members = EXCLUDED.max_members,
         max_workflows = EXCLUDED.max_workflows,
         max_agents = EXCLUDED.max_agents,
         api_calls_per_month = EXCLUDED.api_calls_per_month,
         storage_mb = EXCLUDED.storage_mb`,
      [row.id, limits.maxMembers, limits.maxWorkflows, limits.maxAgents, limits.apiCallsPerMonth, limits.storageMb],
    );

    await this.pool.query(
      `INSERT INTO tenant_lifecycle (organization_id, event_type, performed_by, notes)
       VALUES ($1, 'created', 'system', $2)`,
      [row.id, `Tenant created with plan ${input.plan}`],
    );

    return this.rowToRecord(row, limits);
  }

  async provisionTenant(orgId: string): Promise<TenantRecord> {
    return this.transitionStatus(orgId, 'active', 'provisioned');
  }

  async activateTenant(orgId: string): Promise<TenantRecord> {
    return this.transitionStatus(orgId, 'active', 'activated');
  }

  async suspendTenant(orgId: string, reason: string): Promise<TenantRecord> {
    await this.pool.query(
      `INSERT INTO tenant_lifecycle (organization_id, event_type, performed_by, notes)
       VALUES ($1, 'suspended', 'admin', $2)`,
      [orgId, reason],
    );
    return this.transitionStatus(orgId, 'suspended', `Suspended: ${reason}`);
  }

  async reactivateTenant(orgId: string): Promise<TenantRecord> {
    return this.transitionStatus(orgId, 'active', 'reactivated');
  }

  async archiveTenant(orgId: string, reason: string): Promise<TenantRecord> {
    await this.pool.query(
      `INSERT INTO tenant_lifecycle (organization_id, event_type, performed_by, notes)
       VALUES ($1, 'archived', 'admin', $2)`,
      [orgId, reason],
    );
    return this.transitionStatus(orgId, 'archived', `Archived: ${reason}`);
  }

  async getTenant(orgId: string): Promise<TenantRecord | null> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<OrgRow>(
      'SELECT * FROM organizations WHERE id = $1',
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const limits = await this.getLimits(orgId);
    return this.rowToRecord(row, limits);
  }

  private async transitionStatus(
    orgId: string,
    newStatus: TenantLifecycleStatus,
    note: string,
  ): Promise<TenantRecord> {
    const result = await this.pool.query<OrgRow>(
      `UPDATE organizations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStatus, orgId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Tenant not found');

    await this.pool.query(
      `INSERT INTO tenant_lifecycle (organization_id, event_type, performed_by, notes)
       VALUES ($1, $2, 'system', $3)`,
      [orgId, newStatus, note],
    );

    const limits = await this.getLimits(orgId);
    return this.rowToRecord(row, limits);
  }

  private async getLimits(orgId: string): Promise<TenantLimits> {
    const result = await this.pool.query<{
      max_members: number;
      max_workflows: number;
      max_agents: number;
      api_calls_per_month: number;
      storage_mb: number;
    }>(
      'SELECT * FROM tenant_limits WHERE organization_id = $1',
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return defaultLimits('starter');
    return {
      maxMembers: row.max_members,
      maxWorkflows: row.max_workflows,
      maxAgents: row.max_agents,
      apiCallsPerMonth: row.api_calls_per_month,
      storageMb: row.storage_mb,
    };
  }

  private rowToRecord(row: OrgRow, limits: TenantLimits): TenantRecord {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status as TenantLifecycleStatus,
      plan: row.plan,
      settings: row.settings ?? {},
      limits,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
