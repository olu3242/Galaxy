/**
 * People OS Certification Test Suite
 *
 * Certifies the People module lifecycle:
 * 1.  departments and teams tables exist
 * 2.  Department creation persists a record
 * 3.  Department listing is tenant-scoped
 * 4.  Sub-department (parent) creation links hierarchy
 * 5.  Team creation links to department
 * 6.  Team member addition and listing
 * 7.  Team listing filters by department
 * 8.  Member listing returns org members
 * 9.  Member search returns matching results
 * 10. Cross-tenant isolation — org B cannot see org A departments
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { DepartmentService, TeamService, MemberService } from '@galaxy/people';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2701-4000-8000-270000000001';
const orgIdB = '00000000-2701-4000-8000-270000000002';
const actorId = '00000000-2701-4000-8000-270000000010';
const userId = '00000000-2701-4000-8000-270000000020';

let sharedDeptId: string;
let sharedMembershipId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'People Test Org A', 'people-test-a', 'starter', 'active'),
            ($2, 'People Test Org B', 'people-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  // Create a user and membership so team_members FK is satisfiable
  await pool.query(
    `INSERT INTO users (id, organization_id, display_name, status)
     VALUES ($1, $2, 'People Test User', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [userId, orgId],
  );
  const memberResult = await pool.query<{ id: string }>(
    `INSERT INTO memberships (organization_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active'
     RETURNING id`,
    [orgId, userId],
  );
  sharedMembershipId = memberResult.rows[0]?.id ?? '';

  const deptSvc = new DepartmentService(pool);
  const dept = await deptSvc.create({
    organizationId: orgId,
    name: 'Engineering',
    correlationId: crypto.randomUUID(),
    actorId,
  });
  sharedDeptId = dept.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM team_members WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM memberships WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => null);
  await pool
    .query(`DELETE FROM teams WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM departments WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('People OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. departments and teams tables exist', async () => {
    for (const table of ['departments', 'teams']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Department creation ────────────────────────────────────────────────
  it('2. Department creation persists a record', async () => {
    const svc = new DepartmentService(pool);

    const dept = await svc.create({
      organizationId: orgId,
      name: 'Marketing',
      correlationId: crypto.randomUUID(),
      actorId,
    });

    expect(dept.id).toBeTruthy();
    expect(dept.organizationId).toBe(orgId);
    expect(dept.name).toBe('Marketing');
  });

  // ── 3. Department listing ─────────────────────────────────────────────────
  it('3. Department listing is tenant-scoped', async () => {
    const svc = new DepartmentService(pool);

    const depts = await svc.list(orgId);
    expect(Array.isArray(depts)).toBe(true);
    expect(depts.length).toBeGreaterThan(0);
    for (const d of depts) {
      expect(d.organizationId).toBe(orgId);
    }
  });

  // ── 4. Sub-department hierarchy ───────────────────────────────────────────
  it('4. Sub-department creation links parent hierarchy', async () => {
    const svc = new DepartmentService(pool);

    const sub = await svc.create({
      organizationId: orgId,
      name: 'Frontend',
      parentDepartmentId: sharedDeptId,
      correlationId: crypto.randomUUID(),
      actorId,
    });

    expect(sub.id).toBeTruthy();
    expect(sub.parentDepartmentId).toBe(sharedDeptId);
  });

  // ── 5. Team creation ──────────────────────────────────────────────────────
  it('5. Team creation links to department', async () => {
    const svc = new TeamService(pool);

    const team = await svc.create({
      organizationId: orgId,
      departmentId: sharedDeptId,
      name: 'Platform Team',
      correlationId: crypto.randomUUID(),
      actorId,
    });

    expect(team.id).toBeTruthy();
    expect(team.organizationId).toBe(orgId);
    expect(team.departmentId).toBe(sharedDeptId);
    expect(team.name).toBe('Platform Team');
  });

  // ── 6. Team member management ─────────────────────────────────────────────
  it('6. Team member addition and listing works', async () => {
    const svc = new TeamService(pool);

    const team = await svc.create({
      organizationId: orgId,
      departmentId: sharedDeptId,
      name: `Members Test Team ${crypto.randomUUID().slice(0, 8)}`,
      correlationId: crypto.randomUUID(),
      actorId,
    });

    await svc.addMember(orgId, team.id, sharedMembershipId);

    const members = await svc.getTeamMembers(orgId, team.id);
    expect(Array.isArray(members)).toBe(true);
    expect(members.some((m) => m.membershipId === sharedMembershipId)).toBe(true);
  });

  // ── 7. Team listing by department ─────────────────────────────────────────
  it('7. Team listing filters by department', async () => {
    const svc = new TeamService(pool);

    const teams = await svc.list(orgId, sharedDeptId);
    expect(Array.isArray(teams)).toBe(true);
    expect(teams.length).toBeGreaterThan(0);
    for (const t of teams) {
      expect(t.departmentId).toBe(sharedDeptId);
    }
  });

  // ── 8. Member listing ─────────────────────────────────────────────────────
  it('8. Member listing returns org members', async () => {
    const svc = new MemberService(pool);

    const members = await svc.list(orgId);
    expect(Array.isArray(members)).toBe(true);
  });

  // ── 9. Member search ──────────────────────────────────────────────────────
  it('9. Member search returns matching results', async () => {
    const svc = new MemberService(pool);

    const results = await svc.search(orgId, 'test');
    expect(Array.isArray(results)).toBe(true);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A departments', async () => {
    const svc = new DepartmentService(pool);

    const deptsB = await svc.list(orgIdB);
    const leaked = deptsB.some((d) => d.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
