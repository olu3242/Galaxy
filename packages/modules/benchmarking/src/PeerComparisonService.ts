import type { Pool } from 'pg';
import type { ComparisonReport } from './types.js';
import { IndustryBenchmarkService } from './IndustryBenchmarkService.js';

export class PeerComparisonService {
  private readonly benchmarkService: IndustryBenchmarkService;

  constructor(private readonly pool: Pool) {
    this.benchmarkService = new IndustryBenchmarkService(pool);
  }

  async generateComparisonReport(
    organizationId: string,
    industry: string,
    sizeBucket: string,
    period?: string,
  ): Promise<ComparisonReport> {
    const percentiles = await this.benchmarkService.getOrgPercentile(
      organizationId,
      industry,
      sizeBucket,
      period,
    );
    const p = period ?? new Date().toISOString().slice(0, 7);
    const metricsAboveMedian = percentiles.filter((p2) => p2.percentile >= 50).length;
    const overallPercentile =
      percentiles.length > 0
        ? Math.round(percentiles.reduce((sum, p2) => sum + p2.percentile, 0) / percentiles.length)
        : 50;
    return {
      organizationId,
      period: p,
      percentiles,
      summary: {
        metricsAboveMedian,
        totalMetrics: percentiles.length,
        overallPercentile,
      },
    };
  }
}
