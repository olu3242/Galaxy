import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { DepartmentService, type CreateDepartmentInput } from './DepartmentService.js';
import { TeamService, type CreateTeamInput } from './TeamService.js';
import { MemberService } from './MemberService.js';

/**
 * PeopleService — orchestrates cross-service people operations.
 */
export class PeopleService {
  readonly departments: DepartmentService;
  readonly teams: TeamService;
  readonly members: MemberService;

  constructor(pool: Pool, publisher?: EventPublisher) {
    this.departments = new DepartmentService(pool, publisher);
    this.teams = new TeamService(pool, publisher);
    this.members = new MemberService(pool, publisher);
  }

  /**
   * Creates a department and optionally creates an initial team within it.
   */
  async createDepartmentWithTeam(
    departmentInput: CreateDepartmentInput,
    teamInput?: Omit<
      CreateTeamInput,
      'organizationId' | 'departmentId' | 'correlationId' | 'actorId'
    >,
  ): Promise<{ departmentId: string; teamId?: string }> {
    const department = await this.departments.create(departmentInput);

    if (!teamInput) {
      return { departmentId: department.id };
    }

    const team = await this.teams.create({
      ...teamInput,
      organizationId: department.organizationId,
      departmentId: department.id,
      correlationId: departmentInput.correlationId,
      actorId: departmentInput.actorId,
    });

    return { departmentId: department.id, teamId: team.id };
  }
}
