import type { Pool } from 'pg';
import type { EventPublisher } from '@galaxy/events';
import { createEvent } from '@galaxy/utils';

export interface Department {
  id: string;
  organizationId: string;
  parentDepartmentId: string | null;
  name: string;
  headMemberId: string | null;
  status: 'active' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface DepartmentRow {
  id: string;
  organization_id: string;
  parent_department_id: string | null;
  name: string;
  head_member_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    organizationId: row.organization_id,
    parentDepartmentId: row.parent_department_id,
    name: row.name,
    headMemberId: row.head_member_id,
    status: row.status as Department['status'],
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateDepartmentInput {
  organizationId: string;
  name: string;
  parentDepartmentId?: string;
  headMemberId?: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
  actorId: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  parentDepartmentId?: string | null;
  headMemberId?: string | null;
  metadata?: Record<string, unknown>;
  correlationId: string;
  actorId: string;
}

/**
 * DepartmentService — manages organizational departments.
 */
export class DepartmentService {
  constructor(
    private readonly pool: Pool,
    private readonly publisher?: EventPublisher,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async create(input: CreateDepartmentInput): Promise<Department> {
    await this.setTenantContext(input.organizationId);

    const result = await this.pool.query<DepartmentRow>(
      `INSERT INTO departments (organization_id, name, parent_department_id, head_member_id, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.organizationId,
        input.name,
        input.parentDepartmentId ?? null,
        input.headMemberId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const deptRow = result.rows[0];
    if (!deptRow) throw new Error('INSERT RETURNING returned no row');
    const department = rowToDepartment(deptRow);

    if (this.publisher) {
      const event = createEvent(
        'department.created',
        input.organizationId,
        input.correlationId,
        { type: 'member', id: input.actorId },
        { departmentId: department.id, name: department.name },
      );
      await this.publisher.publish(event);
    }

    return department;
  }

  async getById(organizationId: string, departmentId: string): Promise<Department | null> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<DepartmentRow>(
      'SELECT * FROM departments WHERE organization_id = $1 AND id = $2',
      [organizationId, departmentId],
    );

    const row = result.rows[0];
    return row ? rowToDepartment(row) : null;
  }

  async list(organizationId: string): Promise<Department[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<DepartmentRow>(
      "SELECT * FROM departments WHERE organization_id = $1 AND status = 'active' ORDER BY name ASC",
      [organizationId],
    );

    return result.rows.map(rowToDepartment);
  }

  async update(
    organizationId: string,
    departmentId: string,
    input: UpdateDepartmentInput,
  ): Promise<Department> {
    await this.setTenantContext(organizationId);

    const existing = await this.getById(organizationId, departmentId);
    if (!existing) {
      throw new Error(`Department ${departmentId} not found`);
    }

    const metadata = input.metadata
      ? { ...existing.metadata, ...input.metadata }
      : existing.metadata;

    const result = await this.pool.query<DepartmentRow>(
      `UPDATE departments
       SET name = COALESCE($1, name),
           parent_department_id = COALESCE($2, parent_department_id),
           head_member_id = COALESCE($3, head_member_id),
           metadata = $4,
           updated_at = NOW()
       WHERE organization_id = $5 AND id = $6
       RETURNING *`,
      [
        input.name ?? null,
        input.parentDepartmentId !== undefined
          ? input.parentDepartmentId
          : existing.parentDepartmentId,
        input.headMemberId !== undefined ? input.headMemberId : existing.headMemberId,
        JSON.stringify(metadata),
        organizationId,
        departmentId,
      ],
    );

    const updatedRow = result.rows[0];
    if (!updatedRow) throw new Error('UPDATE RETURNING returned no row');
    return rowToDepartment(updatedRow);
  }

  async archive(organizationId: string, departmentId: string): Promise<void> {
    await this.setTenantContext(organizationId);

    await this.pool.query(
      "UPDATE departments SET status = 'archived', updated_at = NOW() WHERE organization_id = $1 AND id = $2",
      [organizationId, departmentId],
    );
  }
}
