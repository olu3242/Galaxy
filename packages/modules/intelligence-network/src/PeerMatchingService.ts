import type { Pool } from 'pg';
import type { PeerComparison, WorkflowRecommendation } from './types.js';

export class PeerMatchingService {
  constructor(private readonly pool: Pool) {}

  async getPeerComparison(
    organizationId: string,
    industry: string,
    sizeBucket: string,
    period?: string,
  ): Promise<PeerComparison[]> {
    const p = period ?? new Date().toISOString().slice(0, 7);
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const myContribs = await this.pool.query<{ metric_key: string; metric_value: string }>(
      `SELECT metric_key, metric_value FROM intelligence_contributions
       WHERE organization_id = $1 AND period = $2`,
      [organizationId, p],
    );

    const benchmarks = await this.pool.query<{
      metric_key: string;
      p50: string;
      p75: string;
      cohort_size: string;
    }>(
      `SELECT metric_key, p50, p75, cohort_size FROM intelligence_benchmarks
       WHERE industry = $1 AND size_bucket = $2 AND period = $3`,
      [industry, sizeBucket, p],
    );

    const benchmarkMap = new Map(benchmarks.rows.map((b) => [b.metric_key, b]));

    return myContribs.rows.map((c) => {
      const b = benchmarkMap.get(c.metric_key);
      const orgValue = parseFloat(c.metric_value);
      const p50 = b ? parseFloat(b.p50) : 0;
      const p75 = b ? parseFloat(b.p75) : 0;
      const _cohortSize = b ? parseInt(b.cohort_size, 10) : 0;
      const percentileRank = p50 > 0 ? Math.min(100, Math.round((orgValue / p50) * 50)) : 0;
      return {
        organizationId,
        metricKey: c.metric_key,
        orgValue,
        benchmarkP50: p50,
        benchmarkP75: p75,
        percentileRank,
      };
    });
  }

  async getRecommendations(
    organizationId: string,
    industry: string,
    sizeBucket: string,
  ): Promise<WorkflowRecommendation[]> {
    const comparisons = await this.getPeerComparison(organizationId, industry, sizeBucket);
    return comparisons
      .filter((c) => c.percentileRank < 50 && c.benchmarkP75 > 0)
      .map((c) => ({
        metricKey: c.metricKey,
        currentValue: c.orgValue,
        targetValue: c.benchmarkP75,
        improvementPct: Math.round(
          ((c.benchmarkP75 - c.orgValue) / Math.max(c.orgValue, 0.01)) * 100,
        ),
        recommendation: `Improve ${c.metricKey} from ${c.orgValue.toFixed(2)} to ${c.benchmarkP75.toFixed(2)} (75th percentile)`,
      }));
  }
}
