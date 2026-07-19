import { type Pool } from 'pg';
import type { CreateLoopInput, LoopInstance } from '../types.js';

function rowToLoopInstance(row: Record<string, unknown>): LoopInstance {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    workflowInstanceId: row.workflow_instance_id as string,
    status: row.status as LoopInstance['status'],
    verificationDeadline: row.verification_deadline as string,
    feedbackDeadline: row.feedback_deadline as string | null,
    verificationCount: row.verification_count as number,
    feedbackScore: row.feedback_score as number | null,
    outcomeNotes: row.outcome_notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class LoopInstanceService {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateLoopInput): Promise<LoopInstance> {
    const deadlineHours = input.verificationDeadlineHours ?? 24;
    const result = await this.pool.query(
      `INSERT INTO loop_instances
         (organization_id, workflow_instance_id, status, verification_deadline)
       VALUES ($1, $2, 'pending', NOW() + ($3 || ' hours')::interval)
       RETURNING *`,
      [input.organizationId, input.workflowInstanceId, deadlineHours],
    );
    return rowToLoopInstance(result.rows[0] as Record<string, unknown>);
  }

  async getById(id: string, organizationId: string): Promise<LoopInstance | null> {
    const result = await this.pool.query(
      'SELECT * FROM loop_instances WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    if (result.rows.length === 0) return null;
    return rowToLoopInstance(result.rows[0] as Record<string, unknown>);
  }

  async listByWorkflow(
    workflowInstanceId: string,
    organizationId: string,
  ): Promise<LoopInstance[]> {
    const result = await this.pool.query(
      'SELECT * FROM loop_instances WHERE workflow_instance_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [workflowInstanceId, organizationId],
    );
    return (result.rows as Record<string, unknown>[]).map(rowToLoopInstance);
  }

  async startVerification(id: string, organizationId: string): Promise<LoopInstance> {
    const result = await this.pool.query(
      `UPDATE loop_instances
       SET status = 'verifying', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId],
    );
    return rowToLoopInstance(result.rows[0] as Record<string, unknown>);
  }

  async complete(id: string, organizationId: string): Promise<LoopInstance> {
    const result = await this.pool.query(
      `UPDATE loop_instances
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId],
    );
    return rowToLoopInstance(result.rows[0] as Record<string, unknown>);
  }

  async escalate(id: string, organizationId: string, reason: string): Promise<LoopInstance> {
    const result = await this.pool.query(
      `UPDATE loop_instances
       SET status = 'escalated', outcome_notes = $3, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId, reason],
    );
    return rowToLoopInstance(result.rows[0] as Record<string, unknown>);
  }

  async checkSLABreaches(organizationId: string): Promise<LoopInstance[]> {
    const result = await this.pool.query(
      `SELECT * FROM loop_instances
       WHERE organization_id = $1
         AND status = 'verifying'
         AND verification_deadline < NOW()`,
      [organizationId],
    );
    return (result.rows as Record<string, unknown>[]).map(rowToLoopInstance);
  }
}
