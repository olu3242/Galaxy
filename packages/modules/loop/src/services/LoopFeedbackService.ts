import { type Pool } from 'pg';
import type { LoopFeedback, SubmitFeedbackInput } from '../types.js';

function rowToLoopFeedback(row: Record<string, unknown>): LoopFeedback {
  return {
    id: row.id as string,
    loopInstanceId: row.loop_instance_id as string,
    submittedBy: row.submitted_by as string,
    score: row.score as number,
    comment: row.comment as string | null,
    submittedAt: row.submitted_at as string,
  };
}

export class LoopFeedbackService {
  constructor(private readonly pool: Pool) {}

  async submit(input: SubmitFeedbackInput, organizationId: string): Promise<LoopFeedback> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO loop_feedback
           (loop_instance_id, submitted_by, score, comment, submitted_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [input.loopInstanceId, input.submittedBy, input.score, input.comment ?? null],
      );

      await client.query(
        `UPDATE loop_instances
         SET feedback_score = (
           SELECT AVG(score) FROM loop_feedback WHERE loop_instance_id = $1
         ),
         updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [input.loopInstanceId, organizationId],
      );

      await client.query('COMMIT');
      return rowToLoopFeedback(insertResult.rows[0] as Record<string, unknown>);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listByLoop(loopInstanceId: string, organizationId: string): Promise<LoopFeedback[]> {
    const result = await this.pool.query(
      `SELECT lf.*
       FROM loop_feedback lf
       JOIN loop_instances li ON li.id = lf.loop_instance_id
       WHERE lf.loop_instance_id = $1 AND li.organization_id = $2
       ORDER BY lf.submitted_at DESC`,
      [loopInstanceId, organizationId],
    );
    return (result.rows as Record<string, unknown>[]).map(rowToLoopFeedback);
  }

  async getAverageScore(loopInstanceId: string, organizationId: string): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT AVG(lf.score) AS avg_score
       FROM loop_feedback lf
       JOIN loop_instances li ON li.id = lf.loop_instance_id
       WHERE lf.loop_instance_id = $1 AND li.organization_id = $2`,
      [loopInstanceId, organizationId],
    );
    const raw = (result.rows[0] as Record<string, unknown>).avg_score;
    if (raw === null || raw === undefined) return null;
    return Number(raw);
  }
}
