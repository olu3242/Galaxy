import type { Pool } from 'pg';
import type { InsightType, Recommendation, RecommendationPriority } from '../types.js';

interface RecommendationRow {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  priority: string;
  category: string;
  action_items: string[];
  related_entity_id: string | null;
  applied_at: string | null;
  created_at: string;
}

function rowToRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    priority: row.priority as RecommendationPriority,
    category: row.category as InsightType,
    actionItems: row.action_items,
    relatedEntityId: row.related_entity_id,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
  };
}

export class RecommendationService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async generateRecommendations(
    organizationId: string,
    category: InsightType,
    context: Record<string, unknown>,
  ): Promise<Recommendation[]> {
    await this.setTenantContext(organizationId);

    const items = this.buildRecommendationItems(category, context);
    const recommendations: Recommendation[] = [];

    for (const item of items) {
      const result = await this.pool.query<RecommendationRow>(
        `INSERT INTO recommendations
           (organization_id, title, description, priority, category, action_items)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          organizationId,
          item.title,
          item.description,
          item.priority,
          category,
          item.actionItems,
        ],
      );
      if (result.rows[0]) {
        recommendations.push(rowToRecommendation(result.rows[0]));
      }
    }

    return recommendations;
  }

  async prioritizeRecommendations(organizationId: string): Promise<Recommendation[]> {
    await this.setTenantContext(organizationId);

    const result = await this.pool.query<RecommendationRow>(
      `SELECT * FROM recommendations
       WHERE organization_id = $1 AND applied_at IS NULL
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END,
         created_at DESC
       LIMIT 20`,
      [organizationId],
    );

    return result.rows.map(rowToRecommendation);
  }

  private buildRecommendationItems(
    category: InsightType,
    context: Record<string, unknown>,
  ): Array<{
    title: string;
    description: string;
    priority: RecommendationPriority;
    actionItems: string[];
  }> {
    const score = typeof context['score'] === 'number' ? context['score'] : 100;

    if (score < 50) {
      return [
        {
          title: `Improve ${category} performance`,
          description: `Current ${category} score is below threshold at ${score.toFixed(1)}.`,
          priority: 'high' as const,
          actionItems: [
            `Review ${category} metrics`,
            'Identify bottlenecks',
            'Implement improvement plan',
          ],
        },
      ];
    }

    if (score < 75) {
      return [
        {
          title: `Optimize ${category} processes`,
          description: `${category} score can be improved from current ${score.toFixed(1)}.`,
          priority: 'medium' as const,
          actionItems: [`Audit ${category} workflows`, 'Apply best practices'],
        },
      ];
    }

    return [];
  }
}
