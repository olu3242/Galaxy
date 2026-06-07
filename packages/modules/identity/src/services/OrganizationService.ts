import type { Pool } from 'pg';
import type { Organization } from '@galaxy/types';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  industryType: string;
  planTier?: string;
  whatsappPhoneNumberId?: string;
  correlationId: string;
  actorId: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  settings?: Record<string, unknown>;
  correlationId: string;
  actorId: string;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  waba_phone_number_id: string | null;
  waba_access_token_ref: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToOrganization(row: OrgRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    industryType: (row.settings['industryType'] as Organization['industryType']) ?? 'association',
    planTier: (row.tier as Organization['planTier']) ?? 'starter',
    whatsappPhone: row.waba_phone_number_id,
    settings: row.settings,
    isActive: row.status === 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * OrganizationService — manages organization lifecycle.
 */
export class OrganizationService {
  constructor(
    private readonly pool: Pool,
    private readonly publisher?: EventPublisher,
  ) {}

  async create(input: CreateOrganizationInput): Promise<Organization> {
    const settings: Record<string, unknown> = {
      industryType: input.industryType,
    };

    const result = await this.pool.query<OrgRow>(
      `INSERT INTO organizations (name, slug, tier, settings, waba_phone_number_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.name,
        input.slug,
        input.planTier ?? 'starter',
        JSON.stringify(settings),
        input.whatsappPhoneNumberId ?? null,
      ],
    );

    const org = rowToOrganization(result.rows[0]!);

    if (this.publisher) {
      const event = createEvent(
        'organization.created',
        org.id,
        input.correlationId,
        { type: 'system', id: input.actorId },
        { organizationId: org.id, name: org.name, slug: org.slug },
      );
      await this.publisher.publish(event);
    }

    return org;
  }

  async getById(organizationId: string): Promise<Organization | null> {
    const result = await this.pool.query<OrgRow>('SELECT * FROM organizations WHERE id = $1', [
      organizationId,
    ]);

    const row = result.rows[0];
    return row ? rowToOrganization(row) : null;
  }

  async getBySlug(slug: string): Promise<Organization | null> {
    const result = await this.pool.query<OrgRow>('SELECT * FROM organizations WHERE slug = $1', [
      slug,
    ]);

    const row = result.rows[0];
    return row ? rowToOrganization(row) : null;
  }

  async update(organizationId: string, input: UpdateOrganizationInput): Promise<Organization> {
    const existing = await this.getById(organizationId);
    if (!existing) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const newSettings = input.settings
      ? { ...existing.settings, ...input.settings }
      : existing.settings;

    const result = await this.pool.query<OrgRow>(
      `UPDATE organizations
       SET name = COALESCE($1, name),
           settings = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [input.name ?? null, JSON.stringify(newSettings), organizationId],
    );

    return rowToOrganization(result.rows[0]!);
  }

  async activate(organizationId: string): Promise<void> {
    await this.pool.query(
      "UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1",
      [organizationId],
    );
  }

  async suspend(organizationId: string): Promise<void> {
    await this.pool.query(
      "UPDATE organizations SET status = 'suspended', updated_at = NOW() WHERE id = $1",
      [organizationId],
    );
  }
}
