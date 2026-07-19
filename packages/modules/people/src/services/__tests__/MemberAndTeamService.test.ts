/**
 * People OS — MemberService · TeamService · PeopleService unit tests
 *
 * Covers: getById · list · search · update · updateStatus ·
 *         create · getById · list(team) · addMember · removeMember ·
 *         getTeamMembers · archive · createDepartmentWithTeam
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { MemberService } from '../MemberService.js';
import { TeamService } from '../TeamService.js';
import { PeopleService } from '../PeopleService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const DEPT_ID = '00000000-0000-0000-0000-000000000002';
const TEAM_ID = '00000000-0000-0000-0000-000000000003';
const MEMBER_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000011';
const ACTOR = '00000000-0000-0000-0000-000000000099';
const CORR = '00000000-0000-0000-0000-000000000099';
const NOW = '2026-01-01T00:00:00.000Z';

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

function makePublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;
}

function memberRow() {
  return {
    id: MEMBER_ID,
    organization_id: ORG,
    user_id: USER_ID,
    display_name: 'Ada Okafor',
    whatsapp_phone: '+2348001234567',
    email: 'ada@acme.com',
    membership_status: 'active',
    role_id: null,
    profile_data: {},
    last_active_at: null,
    user_created_at: NOW,
    membership_updated_at: NOW,
  };
}

function teamRow() {
  return {
    id: TEAM_ID,
    organization_id: ORG,
    department_id: DEPT_ID,
    name: 'Engineering Alpha',
    lead_member_id: null,
    status: 'active',
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
  };
}

function teamMemberRow() {
  return {
    id: '00000000-0000-0000-0000-000000000050',
    organization_id: ORG,
    team_id: TEAM_ID,
    membership_id: MEMBER_ID,
    joined_at: NOW,
    created_at: NOW,
  };
}

// ─── MemberService ─────────────────────────────────────────────────────────────

describe('MemberService.getById', () => {
  it('returns member profile when found', async () => {
    const pool = makePool([ok([]), ok([memberRow()])]);
    const svc = new MemberService(pool);
    const result = await svc.getById(ORG, MEMBER_ID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(MEMBER_ID);
    expect(result?.displayName).toBe('Ada Okafor');
    expect(result?.status).toBe('active');
  });

  it('returns null when member not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MemberService(pool);
    const result = await svc.getById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });

  it('sets tenant context before query', async () => {
    const pool = makePool([ok([]), ok([memberRow()])]);
    const svc = new MemberService(pool);
    await svc.getById(ORG, MEMBER_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0] as [string, unknown[]])[0]).toBe('SELECT set_config($1, $2, true)');
    expect((calls[0] as [string, unknown[]])[1]).toContain(ORG);
  });
});

describe('MemberService.list', () => {
  it('returns all active members', async () => {
    const pool = makePool([ok([]), ok([memberRow(), memberRow()])]);
    const svc = new MemberService(pool);
    const result = await svc.list(ORG);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no members', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MemberService(pool);
    const result = await svc.list(ORG);
    expect(result).toEqual([]);
  });

  it('passes status filter to query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MemberService(pool);
    await svc.list(ORG, { status: 'suspended' });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain('suspended');
  });
});

describe('MemberService.search', () => {
  it('returns members matching the search query', async () => {
    const pool = makePool([ok([]), ok([memberRow()])]);
    const svc = new MemberService(pool);
    const result = await svc.search(ORG, 'ada');
    expect(result).toHaveLength(1);
    expect(result[0]?.displayName).toBe('Ada Okafor');
  });

  it('passes ILIKE pattern to query', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MemberService(pool);
    await svc.search(ORG, 'okafor');

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain('%okafor%');
  });
});

describe('MemberService.update', () => {
  it('returns updated member profile', async () => {
    const updatedRow = { ...memberRow(), display_name: 'Ada Updated' };
    // update: set_config(1)
    // getById: set_config(2) + SELECT(3)
    // UPDATE users(4)
    // getById: set_config(5) + SELECT(6)
    const pool = makePool([
      ok([]), // 1 set_config (update itself)
      ok([]), // 2 set_config (first getById)
      ok([memberRow()]), // 3 SELECT (first getById)
      ok([]), // 4 UPDATE users
      ok([]), // 5 set_config (second getById)
      ok([updatedRow]), // 6 SELECT (second getById)
    ]);
    const svc = new MemberService(pool);
    const result = await svc.update(ORG, MEMBER_ID, {
      displayName: 'Ada Updated',
      correlationId: CORR,
      actorId: ACTOR,
    });
    expect(result.displayName).toBe('Ada Updated');
  });

  it('throws when member not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MemberService(pool);
    await expect(
      svc.update(ORG, 'bad-id', { correlationId: CORR, actorId: ACTOR }),
    ).rejects.toThrow('not found');
  });

  it('publishes member.updated event when publisher provided', async () => {
    const updatedRow = { ...memberRow() };
    const pool = makePool([
      ok([]), // set_config (update itself)
      ok([]), // set_config (first getById)
      ok([memberRow()]), // SELECT (first getById)
      ok([]), // UPDATE users
      ok([]), // set_config (second getById)
      ok([updatedRow]), // SELECT (second getById)
    ]);
    const publisher = makePublisher();
    const svc = new MemberService(pool, publisher);
    await svc.update(ORG, MEMBER_ID, {
      displayName: 'New Name',
      correlationId: CORR,
      actorId: ACTOR,
    });
    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'member.updated' }),
    );
  });
});

describe('MemberService.updateStatus', () => {
  it('updates membership status without throwing', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new MemberService(pool);
    await expect(svc.updateStatus(ORG, MEMBER_ID, 'suspended', CORR, ACTOR)).resolves.not.toThrow();
  });

  it('publishes event when publisher provided', async () => {
    const pool = makePool([ok([]), ok([])]);
    const publisher = makePublisher();
    const svc = new MemberService(pool, publisher);
    await svc.updateStatus(ORG, MEMBER_ID, 'archived', CORR, ACTOR);
    expect(publisher.publish).toHaveBeenCalledOnce();
  });
});

// ─── TeamService ───────────────────────────────────────────────────────────────

describe('TeamService.create', () => {
  it('sets tenant context and returns mapped Team', async () => {
    const pool = makePool([ok([]), ok([teamRow()])]);
    const svc = new TeamService(pool);
    const result = await svc.create({
      organizationId: ORG,
      departmentId: DEPT_ID,
      name: 'Engineering Alpha',
      correlationId: CORR,
      actorId: ACTOR,
    });

    expect(result.id).toBe(TEAM_ID);
    expect(result.name).toBe('Engineering Alpha');
    expect(result.status).toBe('active');
  });

  it('throws when INSERT returns no row', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TeamService(pool);
    await expect(
      svc.create({
        organizationId: ORG,
        departmentId: DEPT_ID,
        name: 'X',
        correlationId: CORR,
        actorId: ACTOR,
      }),
    ).rejects.toThrow();
  });

  it('publishes team.created event when publisher provided', async () => {
    const pool = makePool([ok([]), ok([teamRow()])]);
    const publisher = makePublisher();
    const svc = new TeamService(pool, publisher);
    await svc.create({
      organizationId: ORG,
      departmentId: DEPT_ID,
      name: 'Engineering Alpha',
      correlationId: CORR,
      actorId: ACTOR,
    });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'team.created' }),
    );
  });
});

describe('TeamService.getById', () => {
  it('returns team when found', async () => {
    const pool = makePool([ok([]), ok([teamRow()])]);
    const svc = new TeamService(pool);
    const result = await svc.getById(ORG, TEAM_ID);
    expect(result?.id).toBe(TEAM_ID);
  });

  it('returns null when not found', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TeamService(pool);
    const result = await svc.getById(ORG, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('TeamService.list', () => {
  it('returns all active teams for org', async () => {
    const pool = makePool([ok([]), ok([teamRow(), teamRow()])]);
    const svc = new TeamService(pool);
    const result = await svc.list(ORG);
    expect(result).toHaveLength(2);
  });

  it('filters by departmentId when provided', async () => {
    const pool = makePool([ok([]), ok([teamRow()])]);
    const svc = new TeamService(pool);
    await svc.list(ORG, DEPT_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1] as [string, unknown[]])[1]).toContain(DEPT_ID);
  });

  it('returns empty array when no teams', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TeamService(pool);
    const result = await svc.list(ORG);
    expect(result).toEqual([]);
  });
});

describe('TeamService.addMember', () => {
  it('returns TeamMember on successful insert', async () => {
    const pool = makePool([ok([]), ok([teamMemberRow()])]);
    const svc = new TeamService(pool);
    const result = await svc.addMember(ORG, TEAM_ID, MEMBER_ID);

    expect(result.teamId).toBe(TEAM_ID);
    expect(result.membershipId).toBe(MEMBER_ID);
  });

  it('returns existing member when conflict occurs', async () => {
    // INSERT returns empty (conflict), then SELECT returns existing row
    const pool = makePool([ok([]), ok([]), ok([teamMemberRow()])]);
    const svc = new TeamService(pool);
    const result = await svc.addMember(ORG, TEAM_ID, MEMBER_ID);
    expect(result.membershipId).toBe(MEMBER_ID);
  });
});

describe('TeamService.removeMember', () => {
  it('executes DELETE without throwing', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TeamService(pool);
    await expect(svc.removeMember(ORG, TEAM_ID, MEMBER_ID)).resolves.not.toThrow();
  });

  it('includes org, team, and membership in DELETE params', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TeamService(pool);
    await svc.removeMember(ORG, TEAM_ID, MEMBER_ID);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const params = (calls[1] as [string, unknown[]])[1];
    expect(params).toContain(ORG);
    expect(params).toContain(TEAM_ID);
    expect(params).toContain(MEMBER_ID);
  });
});

describe('TeamService.getTeamMembers', () => {
  it('returns all members of a team', async () => {
    const pool = makePool([ok([]), ok([teamMemberRow(), teamMemberRow()])]);
    const svc = new TeamService(pool);
    const result = await svc.getTeamMembers(ORG, TEAM_ID);
    expect(result).toHaveLength(2);
  });
});

describe('TeamService.archive', () => {
  it('executes UPDATE without throwing', async () => {
    const pool = makePool([ok([]), ok([])]);
    const svc = new TeamService(pool);
    await expect(svc.archive(ORG, TEAM_ID)).resolves.not.toThrow();
  });
});

// ─── PeopleService ─────────────────────────────────────────────────────────────

describe('PeopleService', () => {
  const deptRow = () => ({
    id: DEPT_ID,
    organization_id: ORG,
    name: 'Engineering',
    head_member_id: null,
    status: 'active',
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
  });

  it('exposes departments, teams, members sub-services', () => {
    const pool = makePool([]);
    const svc = new PeopleService(pool);
    expect(svc.departments).toBeDefined();
    expect(svc.teams).toBeDefined();
    expect(svc.members).toBeDefined();
  });

  it('createDepartmentWithTeam returns departmentId and teamId', async () => {
    // DepartmentService.create: set_config + INSERT
    // TeamService.create: set_config + INSERT
    const pool = makePool([ok([]), ok([deptRow()]), ok([]), ok([teamRow()])]);
    const svc = new PeopleService(pool);
    const result = await svc.createDepartmentWithTeam(
      { organizationId: ORG, name: 'Engineering', correlationId: CORR, actorId: ACTOR },
      { name: 'Alpha', departmentId: DEPT_ID },
    );

    expect(result.departmentId).toBe(DEPT_ID);
    expect(result.teamId).toBe(TEAM_ID);
  });

  it('createDepartmentWithTeam returns only departmentId when no teamInput', async () => {
    const pool = makePool([ok([]), ok([deptRow()])]);
    const svc = new PeopleService(pool);
    const result = await svc.createDepartmentWithTeam({
      organizationId: ORG,
      name: 'Engineering',
      correlationId: CORR,
      actorId: ACTOR,
    });

    expect(result.departmentId).toBe(DEPT_ID);
    expect(result.teamId).toBeUndefined();
  });
});
