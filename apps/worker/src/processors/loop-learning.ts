import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import type { Job } from 'bullmq';
import { withEngineLifecycle } from '../lib/withEngineLifecycle.js';

interface LoopLearningJobData {
  organizationId: string;
  workflowTemplateId: string;
}

interface LoopMetricsRow {
  avg_feedback_score: string | null;
  completion_rate: string | null;
  total_loops: string;
  escalated_loops: string;
  avg_verification_count: string | null;
}

interface InsightRow {
  id: string;
}

export function createLoopLearningProcessor(
  pool: Pool,
  anthropicApiKey: string,
): (job: Job) => Promise<void> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  return async (job: Job): Promise<void> =>
    withEngineLifecycle(job, pool, async () => {
      const { organizationId, workflowTemplateId } = job.data as LoopLearningJobData;

      await pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);

      const metricsResult = await pool.query<LoopMetricsRow>(
        `SELECT
         AVG(lf.score)::text AS avg_feedback_score,
         (COUNT(*) FILTER (WHERE li.status = 'completed')::float /
          NULLIF(COUNT(*), 0) * 100)::text AS completion_rate,
         COUNT(*)::text AS total_loops,
         COUNT(*) FILTER (WHERE li.status = 'escalated')::text AS escalated_loops,
         AVG(li.verification_count)::text AS avg_verification_count
       FROM loop_instances li
       LEFT JOIN loop_feedback lf ON lf.loop_instance_id = li.id
       WHERE li.organization_id = $1
         AND li.workflow_instance_id IN (
           SELECT id FROM workflow_instances
           WHERE organization_id = $1 AND template_id = $2
         )
         AND li.created_at > NOW() - INTERVAL '30 days'`,
        [organizationId, workflowTemplateId],
      );

      const metrics = metricsResult.rows[0];
      if (!metrics || parseInt(metrics.total_loops, 10) < 3) {
        // Not enough data to generate insights
        return;
      }

      const avgScore = metrics.avg_feedback_score ? parseFloat(metrics.avg_feedback_score) : null;
      const completionRate = metrics.completion_rate ? parseFloat(metrics.completion_rate) : null;
      const totalLoops = parseInt(metrics.total_loops, 10);
      const escalatedLoops = parseInt(metrics.escalated_loops, 10);

      const prompt = `You are analyzing Loop OS performance data for a workflow template. Generate actionable improvement recommendations.

Metrics (last 30 days):
- Total loops: ${String(totalLoops)}
- Completion rate: ${completionRate !== null ? `${completionRate.toFixed(1)}%` : 'unknown'}
- Average feedback score: ${avgScore !== null ? avgScore.toFixed(2) : 'unknown'} / 5
- Escalated loops: ${String(escalatedLoops)} (${totalLoops > 0 ? ((escalatedLoops / totalLoops) * 100).toFixed(1) : '0'}%)
- Avg verifications per loop: ${metrics.avg_verification_count ?? 'unknown'}

Respond with ONLY a JSON object:
{
  "summary": "one sentence summary of loop health",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "optimizationScore": <number 0-100>,
  "priority": "low" | "medium" | "high"
}`;

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });

      const firstBlock = response.content[0];
      const rawText = firstBlock?.type === 'text' ? firstBlock.text : '{}';

      let insight: {
        summary: string;
        recommendations: string[];
        optimizationScore: number;
        priority: string;
      };

      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        insight = {
          summary:
            typeof parsed.summary === 'string' ? parsed.summary : 'Loop performance analyzed',
          recommendations: Array.isArray(parsed.recommendations)
            ? (parsed.recommendations as string[]).filter((r): r is string => typeof r === 'string')
            : [],
          optimizationScore:
            typeof parsed.optimizationScore === 'number'
              ? Math.min(100, Math.max(0, parsed.optimizationScore))
              : 50,
          priority:
            parsed.priority === 'high' || parsed.priority === 'medium' || parsed.priority === 'low'
              ? parsed.priority
              : 'medium',
        };
      } catch {
        insight = {
          summary: 'Loop performance analyzed',
          recommendations: [],
          optimizationScore: 50,
          priority: 'medium',
        };
      }

      await pool.query<InsightRow>(
        `INSERT INTO loop_learning_insights
         (organization_id, workflow_template_id, summary, recommendations, optimization_score,
          priority, metrics_snapshot, period_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 30)
       ON CONFLICT (organization_id, workflow_template_id)
       DO UPDATE SET
         summary = EXCLUDED.summary,
         recommendations = EXCLUDED.recommendations,
         optimization_score = EXCLUDED.optimization_score,
         priority = EXCLUDED.priority,
         metrics_snapshot = EXCLUDED.metrics_snapshot,
         updated_at = NOW()`,
        [
          organizationId,
          workflowTemplateId,
          insight.summary,
          JSON.stringify(insight.recommendations),
          insight.optimizationScore,
          insight.priority,
          JSON.stringify({ avgScore, completionRate, totalLoops, escalatedLoops }),
        ],
      );
    });
}
