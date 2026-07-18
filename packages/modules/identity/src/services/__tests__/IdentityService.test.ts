import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { IdentityService } from '../IdentityService.js';
import { OrganizationService } from '../OrganizationService.js';
import { RoleService } from '../RoleService.js';
import { MembershipService } from '../MembershipService.js';

vi.mock('../OrganizationService.js');
vi.mock('../RoleService.js');
vi.mock('../MembershipService.js');
vi.mock('@galaxy/utils', () => ({
  newCorrelationId: vi.fn(() => 'generated-corr-id'),
  createEvent: vi.fn(() => ({ id: 'evt', type: 'test' })),
}));

const mockPool = {} as Pool;

const fakeOrg = {
  id: 'org-111',
  name: 'Acme',
  slug: 'acme',
  industryType: 'tech',
  tier: 'standard',
  status: 'active',
  settings: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const fakeRoles = [
  {
    id: 'role-owner',
    organizationId: 'org-111',
    slug: 'org:owner',
    name: 'Owner',
    scope: 'organization' as const,
    description: null,
    isSystem: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'role-member',
    organizationId: 'org-111',
    slug: 'org:member',
    name: 'Member',
    scope: 'organization' as const,
    description: null,
    isSystem: true,
    createdAt: '',
    updatedAt: '',
  },
];

const fakeMembership = {
  id: 'mem-999',
  organizationId: 'org-111',
  userId: 'user-abc',
  roleId: 'role-owner',
  status: 'active' as const,
  joinedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();

  const MockOrgService = vi.mocked(OrganizationService);
  MockOrgService.prototype.create = vi.fn().mockResolvedValue(fakeOrg);

  const MockRoleService = vi.mocked(RoleService);
  MockRoleService.prototype.provisionDefaultRoles = vi.fn().mockResolvedValue(fakeRoles);

  const MockMemberService = vi.mocked(MembershipService);
  MockMemberService.prototype.addMember = vi.fn().mockResolvedValue(fakeMembership);
});

describe('IdentityService.provisionOrganization', () => {
  it('returns the created organization and owner membership id', async () => {
    const svc = new IdentityService(mockPool);
    const result = await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      ownerUserId: 'user-abc',
    });

    expect(result.organization.id).toBe('org-111');
    expect(result.ownerMembershipId).toBe('mem-999');
  });

  it('calls OrganizationService.create with correct input', async () => {
    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'fintech',
      ownerUserId: 'user-abc',
      correlationId: 'corr-fixed',
    });

    expect(OrganizationService.prototype.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme',
        slug: 'acme',
        industryType: 'fintech',
        actorId: 'user-abc',
        correlationId: 'corr-fixed',
      }),
    );
  });

  it('calls RoleService.provisionDefaultRoles with org id and correlationId', async () => {
    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      ownerUserId: 'user-abc',
      correlationId: 'corr-fixed',
    });

    expect(RoleService.prototype.provisionDefaultRoles).toHaveBeenCalledWith(
      'org-111',
      'corr-fixed',
    );
  });

  it('adds owner member with the org:owner role', async () => {
    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      ownerUserId: 'user-abc',
    });

    expect(MembershipService.prototype.addMember).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-111',
        userId: 'user-abc',
        roleId: 'role-owner',
      }),
    );
  });

  it('adds owner member without roleId when org:owner role is absent', async () => {
    vi.mocked(RoleService.prototype.provisionDefaultRoles).mockResolvedValue([
      fakeRoles[1]!, // only member role
    ]);

    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      ownerUserId: 'user-abc',
    });

    const call = (MembershipService.prototype.addMember as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(call['roleId']).toBeUndefined();
  });

  it('generates a correlationId when not provided', async () => {
    const { newCorrelationId } = await import('@galaxy/utils');
    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      ownerUserId: 'user-abc',
    });
    expect(newCorrelationId).toHaveBeenCalled();
  });

  it('uses provided correlationId without generating one', async () => {
    const { newCorrelationId } = await import('@galaxy/utils');
    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      ownerUserId: 'user-abc',
      correlationId: 'explicit-corr',
    });
    expect(newCorrelationId).not.toHaveBeenCalled();
  });

  it('propagates errors from OrganizationService', async () => {
    vi.mocked(OrganizationService.prototype.create).mockRejectedValue(new Error('DB error'));

    const svc = new IdentityService(mockPool);
    await expect(
      svc.provisionOrganization({
        name: 'Acme',
        slug: 'acme',
        industryType: 'tech',
        ownerUserId: 'user-abc',
      }),
    ).rejects.toThrow('DB error');
  });

  it('passes planTier to OrganizationService when provided', async () => {
    const svc = new IdentityService(mockPool);
    await svc.provisionOrganization({
      name: 'Acme',
      slug: 'acme',
      industryType: 'tech',
      planTier: 'enterprise',
      ownerUserId: 'user-abc',
    });

    expect(OrganizationService.prototype.create).toHaveBeenCalledWith(
      expect.objectContaining({ planTier: 'enterprise' }),
    );
  });
});
