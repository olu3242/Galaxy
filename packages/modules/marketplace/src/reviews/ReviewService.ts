import type { Pool } from 'pg';
import type { Review, ReviewRow, ReviewStatus } from '../types.js';

function rowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    organizationId: row.organization_id,
    marketplaceItemId: row.marketplace_item_id,
    authorId: row.author_id,
    rating: parseInt(row.rating, 10),
    title: row.title,
    body: row.body,
    status: row.status as ReviewStatus,
    moderatedAt: row.moderated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SubmitReviewInput {
  organizationId: string;
  marketplaceItemId: string;
  authorId: string;
  rating: number;
  title: string;
  body: string;
}

export class ReviewService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async submitReview(input: SubmitReviewInput): Promise<Review> {
    await this.setTenantContext(input.organizationId);
    if (input.rating < 1 || input.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    const result = await this.pool.query<ReviewRow>(
      `INSERT INTO reviews (organization_id, marketplace_item_id, author_id, rating, title, body, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        input.organizationId,
        input.marketplaceItemId,
        input.authorId,
        input.rating,
        input.title,
        input.body,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to submit review');
    return rowToReview(row);
  }

  async moderateReview(
    organizationId: string,
    reviewId: string,
    decision: 'approved' | 'rejected',
  ): Promise<Review | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<ReviewRow>(
      `UPDATE reviews SET status = $1, moderated_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [decision, reviewId, organizationId],
    );
    const row = result.rows[0];
    if (row && decision === 'approved') {
      await this.recalculateRating(row.marketplace_item_id);
    }
    return row ? rowToReview(row) : null;
  }

  private async recalculateRating(itemId: string): Promise<void> {
    await this.pool.query(
      `UPDATE marketplace_items
       SET average_rating = (
         SELECT COALESCE(AVG(rating::numeric), 0)
         FROM reviews
         WHERE marketplace_item_id = $1 AND status = 'approved'
       ),
       review_count = (
         SELECT COUNT(*)
         FROM reviews
         WHERE marketplace_item_id = $1 AND status = 'approved'
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [itemId],
    );
  }

  async listReviews(
    organizationId: string,
    itemId: string,
    options: { status?: ReviewStatus; limit?: number; offset?: number },
  ): Promise<Review[]> {
    await this.setTenantContext(organizationId);
    const params: unknown[] = [organizationId, itemId];
    let sql = 'SELECT * FROM reviews WHERE organization_id = $1 AND marketplace_item_id = $2';
    if (options.status !== undefined) {
      params.push(options.status);
      sql += ` AND status = $${String(params.length)}`;
    }
    sql += ' ORDER BY created_at DESC';
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${String(params.length)}`;
    }
    if (options.offset !== undefined) {
      params.push(options.offset);
      sql += ` OFFSET $${String(params.length)}`;
    }
    const result = await this.pool.query<ReviewRow>(sql, params);
    return result.rows.map(rowToReview);
  }
}
