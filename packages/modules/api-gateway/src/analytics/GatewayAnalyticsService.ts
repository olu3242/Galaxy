import type { Pool } from 'pg';
import type { ApiRequestLog, EndpointStats, GatewayStats, LogRequestInput } from '../types.js';

interface RequestLogRow {
  id: string;
  organization_id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  latency_ms: number;
  created_at: Date;
}

interface StatsRow {
  endpoint: string;
  method: string;
  call_count: string;
  error_count: string;
  p50_latency: string;
  p95_latency: string;
  p99_latency: string;
}

interface AggRow {
  total_calls: string;
  error_count: string;
  p95_latency: string;
}

export class GatewayAnalyticsService {
  constructor(private readonly pool: Pool) {}

  async logRequest(input: LogRequestInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_request_logs (organization_id, api_key_id, endpoint, method, status_code, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.organizationId,
        input.apiKeyId,
        input.endpoint,
        input.method,
        input.statusCode,
        input.latencyMs,
      ],
    );
  }

  async getRecentLogs(organizationId: string, limitCount = 100): Promise<ApiRequestLog[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<RequestLogRow>(
      `SELECT * FROM api_request_logs
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [organizationId, limitCount],
    );
    return result.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      apiKeyId: row.api_key_id,
      endpoint: row.endpoint,
      method: row.method as ApiRequestLog['method'],
      statusCode: row.status_code,
      latencyMs: row.latency_ms,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async getStats(organizationId: string, windowHours: 24 | 168 = 24): Promise<GatewayStats> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<AggRow>(
      `SELECT
         COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE status_code >= 400) AS error_count,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency
       FROM api_request_logs
       WHERE organization_id = $1
         AND created_at >= NOW() - ($2 || ' hours')::INTERVAL`,
      [organizationId, windowHours],
    );
    const row = result.rows[0];
    if (!row) {
      return { totalCalls: 0, errorRate: 0, p95LatencyMs: 0, windowHours };
    }
    const totalCalls = parseInt(row.total_calls, 10);
    const errorCount = parseInt(row.error_count, 10);
    return {
      totalCalls,
      errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
      p95LatencyMs: parseFloat(row.p95_latency) || 0,
      windowHours,
    };
  }

  async getStatsByEndpoint(
    organizationId: string,
    windowHours: 24 | 168 = 24,
  ): Promise<EndpointStats[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', organizationId]);
    const result = await this.pool.query<StatsRow>(
      `SELECT
         endpoint,
         method,
         COUNT(*) AS call_count,
         COUNT(*) FILTER (WHERE status_code >= 400) AS error_count,
         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
         PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency
       FROM api_request_logs
       WHERE organization_id = $1
         AND created_at >= NOW() - ($2 || ' hours')::INTERVAL
       GROUP BY endpoint, method
       ORDER BY call_count DESC`,
      [organizationId, windowHours],
    );
    return result.rows.map((row) => {
      const callCount = parseInt(row.call_count, 10);
      const errorCount = parseInt(row.error_count, 10);
      return {
        endpoint: row.endpoint,
        method: row.method,
        callCount,
        errorCount,
        errorRate: callCount > 0 ? errorCount / callCount : 0,
        p50LatencyMs: parseFloat(row.p50_latency) || 0,
        p95LatencyMs: parseFloat(row.p95_latency) || 0,
        p99LatencyMs: parseFloat(row.p99_latency) || 0,
      };
    });
  }

  async getTopEndpoints(
    organizationId: string,
    windowHours: 24 | 168 = 24,
    limitCount = 10,
  ): Promise<EndpointStats[]> {
    const all = await this.getStatsByEndpoint(organizationId, windowHours);
    return all.slice(0, limitCount);
  }
}
