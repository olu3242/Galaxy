import type { Pool } from 'pg';
import type {
  ConfidenceScore,
  ConfidenceDecision,
  ConfidenceThreshold,
  ReviewRequest,
} from './types.js';

interface ScoreRow {
  id: string;
  organization_id: string;
  resource_type: string;
  resource_id: string;
  score: number;
  decision: string;
  factors: Record<string, unknown>;
  review_request_id: string | null;
  created_at: Date;
}

interface ThresholdRow {
  id: string;
  organization_id: string;
  auto_execute_min: number;
  confirmation_min: number;
  created_at: Date;
  updated_at: Date;
}

interface ReviewRow {
  id: string;
  organization_id: string;
  confidence_score_id: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

function rowToScore(row: ScoreRow): ConfidenceScore {
  return {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    score: row.score,
    decision: row.decision as ConfidenceDecision,
    factors: row.factors,
    createdAt: row.created_at,
    ...(row.review_request_id !== null ? { reviewRequestId: row.review_request_id } : {}),
  };
}

function rowToReview(row: ReviewRow): ReviewRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    confidenceScoreId: row.confidence_score_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    reason: row.reason,
    status: row.status as 'pending' | 'approved' | 'rejected',
    createdAt: row.created_at,
    ...(row.reviewed_by !== null ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.reviewed_at !== null ? { reviewedAt: row.reviewed_at } : {}),
  };
}

export class ConfidenceEngine {
  constructor(private readonly pool: Pool) {}

  private async getThreshold(
    orgId: string,
  ): Promise<{ autoExecuteMin: number; confirmationMin: number }> {
    const result = await this.pool.query<ThresholdRow>(
      'SELECT * FROM confidence_thresholds WHERE organization_id = $1 LIMIT 1',
      [orgId],
    );
    const row = result.rows[0];
    return {
      autoExecuteMin: row?.auto_execute_min ?? 0.95,
      confirmationMin: row?.confirmation_min ?? 0.8,
    };
  }

  async score(
    orgId: string,
    resourceType: string,
    resourceId: string,
    score: number,
    factors?: Record<string, unknown>,
  ): Promise<ConfidenceScore> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const threshold = await this.getThreshold(orgId);
    const decision: ConfidenceDecision =
      score >= threshold.autoExecuteMin
        ? 'auto_execute'
        : score >= threshold.confirmationMin
          ? 'request_confirmation'
          : 'human_review';

    const result = await this.pool.query<ScoreRow>(
      `INSERT INTO confidence_scores (organization_id, resource_type, resource_id, score, decision, factors)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orgId, resourceType, resourceId, score, decision, JSON.stringify(factors ?? {})],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record confidence score');
    return rowToScore(row);
  }

  async createReviewRequest(
    orgId: string,
    confidenceScoreId: string,
    resourceType: string,
    resourceId: string,
    reason: string,
  ): Promise<ReviewRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ReviewRow>(
      `INSERT INTO review_requests (organization_id, confidence_score_id, resource_type, resource_id, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, confidenceScoreId, resourceType, resourceId, reason],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create review request');
    return rowToReview(row);
  }

  async resolveReview(
    orgId: string,
    reviewId: string,
    outcome: 'approved' | 'rejected',
    reviewedBy: string,
  ): Promise<ReviewRequest> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ReviewRow>(
      `UPDATE review_requests SET status = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, reviewId, outcome, reviewedBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Review request not found');
    return rowToReview(row);
  }

  async setThreshold(
    orgId: string,
    autoExecuteMin: number,
    confirmationMin: number,
  ): Promise<ConfidenceThreshold> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ThresholdRow>(
      `INSERT INTO confidence_thresholds (organization_id, auto_execute_min, confirmation_min)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id) DO UPDATE
         SET auto_execute_min = EXCLUDED.auto_execute_min,
             confirmation_min = EXCLUDED.confirmation_min,
             updated_at = NOW()
       RETURNING *`,
      [orgId, autoExecuteMin, confirmationMin],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to set threshold');
    return {
      id: row.id,
      organizationId: row.organization_id,
      autoExecuteMin: row.auto_execute_min,
      confirmationMin: row.confirmation_min,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
