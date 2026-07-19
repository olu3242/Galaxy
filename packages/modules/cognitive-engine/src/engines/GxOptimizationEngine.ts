import type { Pool } from 'pg';

export interface BottleneckReport {
  agentId: string;
  organizationId: string;
  bottlenecks: {
    area: string;
    severity: 'low' | 'medium' | 'high';
    avgDurationMs: number;
    occurrences: number;
    suggestion: string;
  }[];
  optimizationScore: number;
  generatedAt: string;
}

export class GxOptimizationEngine {
  constructor(private readonly pool: Pool) {}

  async detectBottlenecks(agentId: string, organizationId: string): Promise<BottleneckReport> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const result = await this.pool.query<{
      intent: string;
      avg_ms: string;
      count: string;
      fail_rate: string;
    }>(
      `SELECT intent,
              AVG(duration_ms) AS avg_ms,
              COUNT(*) AS count,
              AVG(CASE WHEN outcome != 'success' THEN 1.0 ELSE 0.0 END) AS fail_rate
       FROM agent_learning_events
       WHERE agent_id = $1 AND organization_id = $2
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY intent
       HAVING AVG(duration_ms) > 5000 OR AVG(CASE WHEN outcome != 'success' THEN 1.0 ELSE 0.0 END) > 0.3`,
      [agentId, organizationId],
    );

    const bottlenecks = result.rows.map((row) => {
      const avgMs = parseFloat(row.avg_ms);
      const failRate = parseFloat(row.fail_rate);
      const severity: 'low' | 'medium' | 'high' =
        avgMs > 15000 || failRate > 0.5
          ? 'high'
          : avgMs > 8000 || failRate > 0.3
            ? 'medium'
            : 'low';
      return {
        area: row.intent,
        severity,
        avgDurationMs: Math.round(avgMs),
        occurrences: parseInt(row.count, 10),
        suggestion:
          failRate > 0.4
            ? `Routing for "${row.intent}" has high failure rate — review decision rules`
            : `"${row.intent}" is slow (avg ${String(Math.round(avgMs))}ms) — add caching or parallel execution`,
      };
    });

    const optimizationScore =
      bottlenecks.length === 0
        ? 1.0
        : 1.0 -
          bottlenecks.reduce(
            (s, b) => s + (b.severity === 'high' ? 0.2 : b.severity === 'medium' ? 0.1 : 0.05),
            0,
          );

    return {
      agentId,
      organizationId,
      bottlenecks,
      optimizationScore: Math.max(0, optimizationScore),
      generatedAt: new Date().toISOString(),
    };
  }

  async improveRouting(
    organizationId: string,
    intentPattern: string,
    newRoutingRule: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    await this.pool.query(
      `INSERT INTO optimization_routing_overrides (organization_id, intent_pattern, routing_rule, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id, intent_pattern)
       DO UPDATE SET routing_rule = EXCLUDED.routing_rule, updated_at = NOW()`,
      [organizationId, intentPattern, JSON.stringify(newRoutingRule)],
    );
  }
}
