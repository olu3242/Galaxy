import { type Pool } from 'pg';
import type { LoopVerification, SubmitVerificationInput } from '../types.js';

function rowToLoopVerification(row: Record<string, unknown>): LoopVerification {
  return {
    id: row.id as string,
    loopInstanceId: row.loop_instance_id as string,
    verifiedBy: row.verified_by as string,
    status: row.status as LoopVerification['status'],
    notes: row.notes as string | null,
    evidenceUrls: row.evidence_urls as string[],
    verifiedAt: row.verified_at as string | null,
    createdAt: row.created_at as string,
  };
}

export class LoopVerificationService {
  constructor(private readonly pool: Pool) {}

  async submit(input: SubmitVerificationInput, organizationId: string): Promise<LoopVerification> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO loop_verifications
           (loop_instance_id, verified_by, status, notes, evidence_urls, verified_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [
          input.loopInstanceId,
          input.verifiedBy,
          input.status,
          input.notes ?? null,
          input.evidenceUrls ?? [],
        ],
      );

      await client.query(
        `UPDATE loop_instances
         SET verification_count = verification_count + 1, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [input.loopInstanceId, organizationId],
      );

      await client.query('COMMIT');
      return rowToLoopVerification(insertResult.rows[0] as Record<string, unknown>);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listByLoop(loopInstanceId: string, organizationId: string): Promise<LoopVerification[]> {
    const result = await this.pool.query(
      `SELECT lv.*
       FROM loop_verifications lv
       JOIN loop_instances li ON li.id = lv.loop_instance_id
       WHERE lv.loop_instance_id = $1 AND li.organization_id = $2
       ORDER BY lv.created_at DESC`,
      [loopInstanceId, organizationId],
    );
    return (result.rows as Record<string, unknown>[]).map(rowToLoopVerification);
  }

  async getLatest(
    loopInstanceId: string,
    organizationId: string,
  ): Promise<LoopVerification | null> {
    const result = await this.pool.query(
      `SELECT lv.*
       FROM loop_verifications lv
       JOIN loop_instances li ON li.id = lv.loop_instance_id
       WHERE lv.loop_instance_id = $1 AND li.organization_id = $2
       ORDER BY lv.created_at DESC
       LIMIT 1`,
      [loopInstanceId, organizationId],
    );
    if (result.rows.length === 0) return null;
    return rowToLoopVerification(result.rows[0] as Record<string, unknown>);
  }
}
