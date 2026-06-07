import type { Pool } from 'pg';
import type { Organization } from '@galaxy/types';
import type { EventPublisher } from '@galaxy/events';
import { newCorrelationId } from '@galaxy/utils';
import { OrganizationService, type CreateOrganizationInput } from './OrganizationService.js';
import { RoleService } from './RoleService.js';
import { MembershipService } from './MembershipService.js';

export interface ProvisionOrganizationInput {
  name: string;
  slug: string;
  industryType: string;
  planTier?: string;
  ownerUserId: string;
  correlationId?: string;
}

export interface ProvisionResult {
  organization: Organization;
  ownerMembershipId: string;
}

/**
 * IdentityService — orchestrates organization creation and default setup.
 *
 * On organization creation:
 * 1. Creates the organization record
 * 2. Provisions default system roles
 * 3. Adds the owner as a member with the owner role
 */
export class IdentityService {
  private readonly orgService: OrganizationService;
  private readonly roleService: RoleService;
  private readonly memberService: MembershipService;

  constructor(
    private readonly pool: Pool,
    publisher?: EventPublisher,
  ) {
    this.orgService = new OrganizationService(pool, publisher);
    this.roleService = new RoleService(pool, publisher);
    this.memberService = new MembershipService(pool, publisher);
  }

  async provisionOrganization(input: ProvisionOrganizationInput): Promise<ProvisionResult> {
    const correlationId = input.correlationId ?? newCorrelationId();

    // 1. Create the organization
    const orgInput: CreateOrganizationInput = {
      name: input.name,
      slug: input.slug,
      industryType: input.industryType,
      ...(input.planTier !== undefined ? { planTier: input.planTier } : {}),
      correlationId,
      actorId: input.ownerUserId,
    };

    const organization = await this.orgService.create(orgInput);

    // 2. Provision default system roles
    const roles = await this.roleService.provisionDefaultRoles(organization.id, correlationId);

    // 3. Add owner as member with owner role
    const ownerRole = roles.find((r) => r.slug === 'org:owner');

    const membership = await this.memberService.addMember({
      organizationId: organization.id,
      userId: input.ownerUserId,
      ...(ownerRole !== undefined ? { roleId: ownerRole.id } : {}),
      correlationId,
      actorId: input.ownerUserId,
    });

    return {
      organization,
      ownerMembershipId: membership.id,
    };
  }
}
