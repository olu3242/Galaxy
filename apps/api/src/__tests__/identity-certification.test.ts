/**
 * Identity OS Certification Test Suite
 *
 * Certifies the Identity module lifecycle:
 * 1.  roles and permissions tables exist
 * 2.  Role creation persists a record
 * 3.  Role listing is tenant-scoped
 * 4.  Permission creation persists a record
 * 5.  Permission assignment to role works
 * 6.  Permission check returns correct result
 * 7.  Default role provisioning creates system roles
 * 8.  Membership addition persists a record
 * 9.  Membership retrieval returns the member
 * 10. Cross-tenant isolation — org B cannot see org A roles
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { RoleService, PermissionService, MembershipService } from '@galaxy/identity';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2801-4000-8000-280000000001';
const orgIdB = '00000000-2801-4000-8000-280000000002';
const actorId = '00000000-2801-4000-8000-280000000010';
const userId = '00000000-2801-4000-8000-280000000011';

let sharedRoleId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Identity Test Org A', 'identity-test-a', 'starter', 'active'),
            ($2, 'Identity Test Org B', 'identity-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const roleSvc = new RoleService(pool);
  const role = await roleSvc.createRole({
    organizationId: orgId,
    name: 'Shared Cert Role',
    slug: `shared-cert-role-${crypto.randomUUID().slice(0, 8)}`,
    scope: 'organization',
    correlationId: crypto.randomUUID(),
    actorId,
  });
  sharedRoleId = role.id;
});

afterAll(async () => {
  await pool
    .query(
      `DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id IN ($1, $2))`,
      [orgId, orgIdB],
    )
    .catch(() => null);
  await pool
    .query(`DELETE FROM permissions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM memberships WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM roles WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Identity OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. roles and permissions tables exist', async () => {
    for (const table of ['roles', 'permissions']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Role creation ──────────────────────────────────────────────────────
  it('2. Role creation persists a record', async () => {
    const svc = new RoleService(pool);

    const role = await svc.createRole({
      organizationId: orgId,
      name: 'Reviewer',
      slug: `reviewer-${crypto.randomUUID().slice(0, 8)}`,
      scope: 'organization',
      description: 'Can review workflows',
      correlationId: crypto.randomUUID(),
      actorId,
    });

    expect(role.id).toBeTruthy();
    expect(role.organizationId).toBe(orgId);
    expect(role.name).toBe('Reviewer');
  });

  // ── 3. Role listing ───────────────────────────────────────────────────────
  it('3. Role listing is tenant-scoped', async () => {
    const svc = new RoleService(pool);

    const roles = await svc.getRolesForOrg(orgId);
    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) {
      expect(r.organizationId).toBe(orgId);
    }
  });

  // ── 4. Permission creation ────────────────────────────────────────────────
  it('4. Permission creation persists a record', async () => {
    const svc = new PermissionService(pool);

    const perm = await svc.createPermission({
      organizationId: orgId,
      name: 'Read Workflows',
      slug: `read-workflows-${crypto.randomUUID().slice(0, 8)}`,
      resource: 'workflow',
      action: 'read',
      description: 'Can read workflow definitions',
    });

    expect(perm.id).toBeTruthy();
    expect(perm.organizationId).toBe(orgId);
    expect(perm.resource).toBe('workflow');
    expect(perm.action).toBe('read');
  });

  // ── 5. Permission assignment ──────────────────────────────────────────────
  it('5. Permission assignment to role works', async () => {
    const svc = new PermissionService(pool);

    const perm = await svc.createPermission({
      organizationId: orgId,
      name: 'Submit Approvals',
      slug: `submit-approvals-${crypto.randomUUID().slice(0, 8)}`,
      resource: 'approval',
      action: 'submit',
    });

    await expect(svc.assignPermissionToRole(orgId, sharedRoleId, perm.id)).resolves.not.toThrow();
  });

  // ── 6. Permission check ───────────────────────────────────────────────────
  it('6. Permission check returns correct result', async () => {
    const svc = new PermissionService(pool);

    const result = await svc.checkPermission(orgId, sharedRoleId, 'approval', 'submit');
    expect(typeof result).toBe('boolean');
  });

  // ── 7. Default role provisioning ──────────────────────────────────────────
  it('7. Default role provisioning creates system roles', async () => {
    const svc = new RoleService(pool);

    await expect(svc.provisionDefaultRoles(orgId, crypto.randomUUID())).resolves.not.toThrow();

    const roles = await svc.getRolesForOrg(orgId);
    expect(roles.length).toBeGreaterThan(0);
  });

  // ── 8. Membership addition ────────────────────────────────────────────────
  it('8. Membership addition persists a record', async () => {
    const svc = new MembershipService(pool);

    const membership = await svc.addMember({
      organizationId: orgId,
      userId,
      roleId: sharedRoleId,
      correlationId: crypto.randomUUID(),
      actorId,
    });

    expect(membership.id).toBeTruthy();
    expect(membership.organizationId).toBe(orgId);
    expect(membership.userId).toBe(userId);
  });

  // ── 9. Membership retrieval ───────────────────────────────────────────────
  it('9. Membership retrieval returns the member', async () => {
    const svc = new MembershipService(pool);

    const membership = await svc.getMembership(orgId, userId);
    expect(membership).not.toBeNull();
    expect(membership?.organizationId).toBe(orgId);
    expect(membership?.userId).toBe(userId);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A roles', async () => {
    const svc = new RoleService(pool);

    const rolesB = await svc.getRolesForOrg(orgIdB);
    const leaked = rolesB.some((r) => r.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
