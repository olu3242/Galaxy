import type { Pool } from 'pg';
import type { Partner, PartnerRow, PartnerType, PartnerTier, PartnerStatus } from '../types.js';

function rowToPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    type: row.type as PartnerType,
    tier: row.tier as PartnerTier,
    status: row.status as PartnerStatus,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

export interface RegisterPartnerInput {
  organizationId: string;
  name: string;
  type: PartnerType;
  tier: PartnerTier;
  contactEmail: string;
  contactName: string;
}

export interface ListPartnersOptions {
  type?: PartnerType;
  tier?: PartnerTier;
  status?: PartnerStatus;
  limit?: number;
  offset?: number;
}

export interface UpdatePartnerProfileInput {
  name?: string;
  contactEmail?: string;
  contactName?: string;
}

export class PartnerService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async registerPartner(input: RegisterPartnerInput): Promise<Partner> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<PartnerRow>(
      `INSERT INTO partners (organization_id, name, type, tier, status, contact_email, contact_name)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.type,
        input.tier,
        input.contactEmail,
        input.contactName,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to register partner');
    return rowToPartner(row);
  }

  async getPartner(organizationId: string, partnerId: string): Promise<Partner | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<PartnerRow>(
      'SELECT * FROM partners WHERE id = $1 AND organization_id = $2',
      [partnerId, organizationId],
    );
    const row = result.rows[0];
    return row ? rowToPartner(row) : null;
  }

  async listPartners(adminOrgId: string, options: ListPartnersOptions = {}): Promise<Partner[]> {
    await this.setTenantContext(adminOrgId);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options.type !== undefined) {
      conditions.push(`type = $${idx}`);
      params.push(options.type);
      idx++;
    }
    if (options.tier !== undefined) {
      conditions.push(`tier = $${idx}`);
      params.push(options.tier);
      idx++;
    }
    if (options.status !== undefined) {
      conditions.push(`status = $${idx}`);
      params.push(options.status);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    params.push(limit, offset);

    const result = await this.pool.query<PartnerRow>(
      `SELECT * FROM partners ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    );
    return result.rows.map(rowToPartner);
  }

  async approvePartner(
    adminOrgId: string,
    partnerId: string,
    approvedBy: string,
  ): Promise<Partner | null> {
    await this.setTenantContext(adminOrgId);
    const result = await this.pool.query<PartnerRow>(
      `UPDATE partners
       SET status = 'approved', approved_by = $2, approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [partnerId, approvedBy],
    );
    const row = result.rows[0];
    return row ? rowToPartner(row) : null;
  }

  async rejectPartner(adminOrgId: string, partnerId: string): Promise<Partner | null> {
    await this.setTenantContext(adminOrgId);
    const result = await this.pool.query<PartnerRow>(
      `UPDATE partners SET status = 'rejected' WHERE id = $1 RETURNING *`,
      [partnerId],
    );
    const row = result.rows[0];
    return row ? rowToPartner(row) : null;
  }

  async updatePartnerProfile(
    organizationId: string,
    partnerId: string,
    input: UpdatePartnerProfileInput,
  ): Promise<Partner | null> {
    await this.setTenantContext(organizationId);
    const sets: string[] = [];
    const params: unknown[] = [partnerId, organizationId];
    let idx = 3;

    if (input.name !== undefined) {
      sets.push(`name = $${idx}`);
      params.push(input.name);
      idx++;
    }
    if (input.contactEmail !== undefined) {
      sets.push(`contact_email = $${idx}`);
      params.push(input.contactEmail);
      idx++;
    }
    if (input.contactName !== undefined) {
      sets.push(`contact_name = $${idx}`);
      params.push(input.contactName);
      idx++;
    }

    if (sets.length === 0) {
      return this.getPartner(organizationId, partnerId);
    }

    const result = await this.pool.query<PartnerRow>(
      `UPDATE partners SET ${sets.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      params,
    );
    const row = result.rows[0];
    return row ? rowToPartner(row) : null;
  }
}
