import type { Pool } from 'pg';
import type { WorkloadForecast } from './types.js';

export class WorkloadForecastService {
  constructor(private readonly pool: Pool) {}

  async forecast(organizationId: string, domain: string): Promise<WorkloadForecast> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);

    // 90-day rolling average + day-of-week seasonality
    const result = await this.pool.query<{
      day_of_week: string;
      avg_count: string;
    }>(
      `SELECT EXTRACT(DOW FROM created_at)::text as day_of_week,
              AVG(daily_count) as avg_count
       FROM (
         SELECT DATE(created_at) as day, EXTRACT(DOW FROM created_at) as created_at, COUNT(*) as daily_count
         FROM workflow_runs
         WHERE organization_id = $1
           AND created_at > NOW() - INTERVAL '90 days'
         GROUP BY DATE(created_at), EXTRACT(DOW FROM created_at)
       ) sub
       GROUP BY day_of_week`,
      [organizationId],
    );

    const totalAvg =
      result.rows.reduce((sum, r) => sum + parseFloat(r.avg_count), 0) /
      Math.max(result.rows.length, 1);
    const currentDow = new Date().getDay().toString();
    const todayRow = result.rows.find((r) => r.day_of_week === currentDow);
    const seasonalityFactor = todayRow
      ? parseFloat(todayRow.avg_count) / Math.max(totalAvg, 1)
      : 1.0;
    const forecastedVolume = Math.round(totalAvg * seasonalityFactor);

    return {
      domain,
      organizationId,
      period: new Date().toISOString().slice(0, 10),
      forecastedVolume,
      historicalAvg: Math.round(totalAvg),
      seasonalityFactor: Math.round(seasonalityFactor * 100) / 100,
      confidence: result.rows.length >= 7 ? 0.8 : 0.4,
    };
  }
}
