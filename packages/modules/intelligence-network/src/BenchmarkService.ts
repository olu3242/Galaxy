import type { Pool } from 'pg';
import type { IntelligenceBenchmark, IntelligenceBenchmarkRow } from './types.js';

const MIN_COHORT = 10;

function rowToBenchmark(row: IntelligenceBenchmarkRow): IntelligenceBenchmark {
  return {
    id: row.id,
    industry: row.industry,
    sizeBucket: row.size_bucket,
    metricKey: row.metric_key,
    p25: parseFloat(row.p25),
    p50: parseFloat(row.p50),
    p75: parseFloat(row.p75),
    p90: parseFloat(row.p90),
    cohortSize: parseInt(row.cohort_size, 10),
    period: row.period,
    createdAt: row.created_at,
  };
}

export class BenchmarkService {
  constructor(private readonly pool: Pool) {}

  async aggregateBenchmarks(
    industry: string,
    sizeBucket: string,
    period: string,
  ): Promise<IntelligenceBenchmark[]> {
    const result = await this.pool.query<{
      metric_key: string;
      count: string;
      p25: string;
      p50: string;
      p75: string;
      p90: string;
    }>(
      `SELECT
         metric_key,
         COUNT(DISTINCT organization_id) as count,
         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY metric_value) as p25,
         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY metric_value) as p50,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY metric_value) as p75,
         PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY metric_value) as p90
       FROM intelligence_contributions
       WHERE period = $1
       GROUP BY metric_key
       HAVING COUNT(DISTINCT organization_id) >= $2`,
      [period, MIN_COHORT],
    );

    const benchmarks: IntelligenceBenchmark[] = [];
    for (const row of result.rows) {
      const upsert = await this.pool.query<IntelligenceBenchmarkRow>(
        `INSERT INTO intelligence_benchmarks
           (industry, size_bucket, metric_key, p25, p50, p75, p90, cohort_size, period)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (industry, size_bucket, metric_key, period) DO UPDATE
           SET p25 = $4, p50 = $5, p75 = $6, p90 = $7, cohort_size = $8
         RETURNING *`,
        [
          industry,
          sizeBucket,
          row.metric_key,
          row.p25,
          row.p50,
          row.p75,
          row.p90,
          row.count,
          period,
        ],
      );
      const b = upsert.rows[0];
      if (b) benchmarks.push(rowToBenchmark(b));
    }
    return benchmarks;
  }

  async getBenchmarks(
    industry: string,
    sizeBucket: string,
    period?: string,
  ): Promise<IntelligenceBenchmark[]> {
    const p = period ?? new Date().toISOString().slice(0, 7);
    const result = await this.pool.query<IntelligenceBenchmarkRow>(
      `SELECT * FROM intelligence_benchmarks
       WHERE industry = $1 AND size_bucket = $2 AND period = $3
       ORDER BY metric_key`,
      [industry, sizeBucket, p],
    );
    return result.rows.map(rowToBenchmark);
  }
}
