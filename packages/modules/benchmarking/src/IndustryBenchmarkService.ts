import type { Pool } from 'pg';
import type { OrgPercentile, BenchmarkReport } from './types.js';

export class IndustryBenchmarkService {
  constructor(private readonly pool: Pool) {}

  async getOrgPercentile(
    organizationId: string,
    industry: string,
    sizeBucket: string,
    period?: string,
  ): Promise<OrgPercentile[]> {
    const p = period ?? new Date().toISOString().slice(0, 7);
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    const contribs = await this.pool.query<{ metric_key: string; metric_value: string }>(
      'SELECT metric_key, metric_value FROM intelligence_contributions WHERE organization_id = $1 AND period = $2',
      [organizationId, p],
    );

    const benchmarks = await this.pool.query<{
      metric_key: string;
      p25: string;
      p50: string;
      p75: string;
      p90: string;
    }>(
      'SELECT metric_key, p25, p50, p75, p90 FROM intelligence_benchmarks WHERE industry = $1 AND size_bucket = $2 AND period = $3',
      [industry, sizeBucket, p],
    );

    const bMap = new Map(benchmarks.rows.map((b) => [b.metric_key, b]));

    return contribs.rows.map((c) => {
      const b = bMap.get(c.metric_key);
      const value = parseFloat(c.metric_value);
      let percentile = 50;
      if (b) {
        const p25 = parseFloat(b.p25);
        const p50 = parseFloat(b.p50);
        const p75 = parseFloat(b.p75);
        const p90 = parseFloat(b.p90);
        if (value >= p90) percentile = 90;
        else if (value >= p75) percentile = 75;
        else if (value >= p50) percentile = 50;
        else if (value >= p25) percentile = 25;
        else percentile = 10;
      }
      return {
        organizationId,
        metricKey: c.metric_key,
        value,
        percentile,
        industry,
        sizeBucket,
        period: p,
      };
    });
  }

  async getIndustryReport(
    industry: string,
    sizeBucket: string,
    period?: string,
  ): Promise<BenchmarkReport> {
    const p = period ?? new Date().toISOString().slice(0, 7);
    const result = await this.pool.query<{
      metric_key: string;
      p25: string;
      p50: string;
      p75: string;
      p90: string;
      cohort_size: string;
    }>(
      'SELECT metric_key, p25, p50, p75, p90, cohort_size FROM intelligence_benchmarks WHERE industry = $1 AND size_bucket = $2 AND period = $3',
      [industry, sizeBucket, p],
    );
    return {
      industry,
      sizeBucket,
      period: p,
      metrics: result.rows.map((r) => ({
        key: r.metric_key,
        p25: parseFloat(r.p25),
        p50: parseFloat(r.p50),
        p75: parseFloat(r.p75),
        p90: parseFloat(r.p90),
        cohortSize: parseInt(r.cohort_size, 10),
      })),
    };
  }
}
