import type { Pool } from 'pg';
import type { CreateTaskInput, Task, TaskStatus } from '../types.js';

interface TaskRow {
  id: string;
  organization_id: string;
  workflow_run_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string;
  due_at: string | null;
  completed_at: string | null;
  correlation_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    status: row.status as TaskStatus,
    priority: row.priority as Task['priority'],
    reporterId: row.created_by,
    correlationId: row.correlation_id,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.workflow_run_id !== null ? { workflowRunId: row.workflow_run_id } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.assigned_to !== null ? { assigneeId: row.assigned_to } : {}),
    ...(row.due_at !== null ? { dueAt: row.due_at } : {}),
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
  };
}

export class TaskEngineService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<TaskRow>(
      `INSERT INTO tasks
         (organization_id, workflow_run_id, title, description, status, priority,
          assigned_to, created_by, due_at, data, correlation_id)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.organizationId,
        input.workflowRunId ?? null,
        input.title,
        input.description ?? null,
        input.priority ?? 'medium',
        input.assigneeId ?? null,
        input.reporterId,
        input.dueAt ?? null,
        JSON.stringify(input.data ?? {}),
        input.correlationId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT INTO tasks RETURNING returned no row');
    return rowToTask(row);
  }

  async getTask(organizationId: string, taskId: string): Promise<Task | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE organization_id = $1 AND id = $2`,
      [organizationId, taskId],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToTask(row) : null;
  }

  async assignTask(
    organizationId: string,
    taskId: string,
    assigneeId: string,
    actorId: string,
  ): Promise<Task> {
    await this.setTenantContext(organizationId);
    const prevResult = await this.pool.query<{ status: string }>(
      `SELECT status FROM tasks WHERE organization_id = $1 AND id = $2`,
      [organizationId, taskId],
    );
    const prev = prevResult.rows[0];
    if (!prev) throw new Error(`Task not found: ${taskId}`);
    const newStatus = prev.status === 'pending' ? 'in_progress' : prev.status;
    const result = await this.pool.query<TaskRow>(
      `UPDATE tasks SET assigned_to = $3, status = $4, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [organizationId, taskId, assigneeId, newStatus],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Task not found: ${taskId}`);
    await this.pool.query(
      `INSERT INTO task_assignments (organization_id, task_id, member_id, assigned_by)
       VALUES ($1, $2, $3, $4)`,
      [organizationId, taskId, assigneeId, actorId],
    );
    await this.pool.query(
      `INSERT INTO task_history (organization_id, task_id, from_status, to_status, actor_type, actor_id)
       VALUES ($1, $2, $3, $4, 'member', $5)`,
      [organizationId, taskId, prev.status, newStatus, actorId],
    );
    return rowToTask(row);
  }

  async completeTask(
    organizationId: string,
    taskId: string,
    actorId: string,
    notes?: string,
  ): Promise<Task> {
    await this.setTenantContext(organizationId);
    const prevResult = await this.pool.query<{ status: string }>(
      `SELECT status FROM tasks WHERE organization_id = $1 AND id = $2`,
      [organizationId, taskId],
    );
    const prev = prevResult.rows[0];
    if (!prev) throw new Error(`Task not found: ${taskId}`);
    const result = await this.pool.query<TaskRow>(
      `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [organizationId, taskId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Task not found: ${taskId}`);
    await this.pool.query(
      `INSERT INTO task_history (organization_id, task_id, from_status, to_status, actor_type, actor_id, notes)
       VALUES ($1, $2, $3, 'completed', 'member', $4, $5)`,
      [organizationId, taskId, prev.status, actorId, notes ?? null],
    );
    return rowToTask(row);
  }

  async listTasks(
    organizationId: string,
    opts?: {
      assigneeId?: string;
      status?: TaskStatus;
      workflowRunId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Task[]> {
    await this.setTenantContext(organizationId);
    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (opts?.assigneeId !== undefined) {
      conditions.push(`assigned_to = $${String(idx)}`);
      params.push(opts.assigneeId);
      idx++;
    }
    if (opts?.status !== undefined) {
      conditions.push(`status = $${String(idx)}`);
      params.push(opts.status);
      idx++;
    }
    if (opts?.workflowRunId !== undefined) {
      conditions.push(`workflow_run_id = $${String(idx)}`);
      params.push(opts.workflowRunId);
      idx++;
    }
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    params.push(limit, offset);
    const result = await this.pool.query<TaskRow>(
      `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${String(idx)} OFFSET $${String(idx + 1)}`,
      params,
    );
    return result.rows.map(rowToTask);
  }
}
