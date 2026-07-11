import type { Pool } from 'pg';

export interface LearningEvent {
  agentId: string;
  organizationId: string;
  executionId: string;
  outcome: 'success' | 'failure' | 'partial';
  intent: string;
  actions: string[];
  durationMs: number;
  confidenceScore: number;
  humanEscalated: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface LearningInsight {
  agentId: string;
  organizationId: string;
  pattern: string;
  frequency: number;
  avgConfidence: number;
  successRate: number;
  recommendation: string;
  generatedAt: string;
}

export class GxLearningEngine {
  constructor(private readonly pool: Pool) {}

  async recordOutcome(event: LearningEvent): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      event.organizationId,
    ]);
    await this.pool.query(
      `INSERT INTO agent_learning_events
         (agent_id, organization_id, execution_id, outcome, intent, actions,
          duration_ms, confidence_score, human_escalated, error_message, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        event.agentId,
        event.organizationId,
        event.executionId,
        event.outcome,
        event.intent,
        JSON.stringify(event.actions),
        event.durationMs,
        event.confidenceScore,
        event.humanEscalated,
        event.errorMessage ?? null,
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  }

  async generateInsights(agentId: string, organizationId: string): Promise<LearningInsight[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<{
      intent: string;
      frequency: string;
      avg_confidence: string;
      success_rate: string;
    }>(
      `SELECT intent,
              COUNT(*) AS frequency,
              AVG(confidence_score) AS avg_confidence,
              AVG(CASE WHEN outcome = 'success' THEN 1.0 ELSE 0.0 END) AS success_rate
       FROM agent_learning_events
       WHERE agent_id = $1 AND organization_id = $2
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY intent
       ORDER BY frequency DESC
       LIMIT 10`,
      [agentId, organizationId],
    );

    return result.rows.map((row) => {
      const successRate = parseFloat(row.success_rate);
      return {
        agentId,
        organizationId,
        pattern: row.intent,
        frequency: parseInt(row.frequency, 10),
        avgConfidence: parseFloat(row.avg_confidence),
        successRate,
        recommendation:
          successRate < 0.6
            ? `Intent "${row.intent}" has low success rate (${(successRate * 100).toFixed(0)}%) — review handling logic`
            : successRate > 0.9
              ? `Intent "${row.intent}" performs well — consider promoting to auto-approve`
              : `Intent "${row.intent}" performs adequately`,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async updateMemoryFromLearning(
    agentId: string,
    organizationId: string,
    insight: LearningInsight,
    pool: Pool,
  ): Promise<void> {
    await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    await pool.query(
      `INSERT INTO agent_memories (agent_id, organization_id, scope, key, value, relevance_score)
       VALUES ($1, $2, 'long_term', $3, $4, $5)
       ON CONFLICT (agent_id, organization_id, scope, key)
       DO UPDATE SET value = EXCLUDED.value, relevance_score = EXCLUDED.relevance_score, updated_at = NOW()`,
      [
        agentId,
        organizationId,
        `learning:${insight.pattern}`,
        JSON.stringify({
          successRate: insight.successRate,
          recommendation: insight.recommendation,
          frequency: insight.frequency,
        }),
        insight.successRate,
      ],
    );
  }
}
