import type { Pool } from 'pg';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message: string | null;
  checkedAt: string;
}

export interface SloMetric {
  name: string;
  target: number;
  actual: number;
  met: boolean;
  measuredAt: string;
}

export interface PlatformHealthReport {
  overallStatus: HealthStatus;
  healthScore: number;
  checks: HealthCheck[];
  slos: SloMetric[];
  generatedAt: string;
}

export class PlatformHealthService {
  constructor(private readonly pool: Pool) {}

  async runHealthChecks(): Promise<PlatformHealthReport> {
    const checks: HealthCheck[] = [];
    const now = new Date().toISOString();

    const dbCheck = await this.checkDatabase();
    checks.push(dbCheck);

    const tenantCheck = await this.checkTenantHealth();
    checks.push(tenantCheck);

    const unhealthyCount = checks.filter((c) => c.status === 'unhealthy').length;
    const degradedCount = checks.filter((c) => c.status === 'degraded').length;

    const overallStatus: HealthStatus =
      unhealthyCount > 0 ? 'unhealthy' : degradedCount > 0 ? 'degraded' : 'healthy';

    const healthScore = Math.round(
      (checks.filter((c) => c.status === 'healthy').length / checks.length) * 100,
    );

    const slos = this.computeSlos(checks);

    return { overallStatus, healthScore, checks, slos, generatedAt: now };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return {
        name: 'database',
        status: 'healthy',
        latencyMs: Date.now() - start,
        message: null,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        name: 'database',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Unknown error',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private async checkTenantHealth(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const result = await this.pool.query<{ suspended: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'suspended')::text AS suspended,
           COUNT(*)::text AS total
         FROM organizations`,
      );
      const row = result.rows[0];
      const suspended = parseInt(row?.suspended ?? '0', 10);
      const total = parseInt(row?.total ?? '0', 10);
      const ratio = total > 0 ? suspended / total : 0;
      const status: HealthStatus = ratio > 0.2 ? 'degraded' : 'healthy';
      return {
        name: 'tenant_health',
        status,
        latencyMs: Date.now() - start,
        message: `${String(suspended)}/${String(total)} tenants suspended`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        name: 'tenant_health',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Unknown error',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private computeSlos(checks: HealthCheck[]): SloMetric[] {
    const healthyRatio = checks.filter((c) => c.status === 'healthy').length / checks.length;
    const avgLatency = checks.reduce((sum, c) => sum + c.latencyMs, 0) / checks.length;
    const now = new Date().toISOString();
    return [
      {
        name: 'availability',
        target: 99.9,
        actual: healthyRatio * 100,
        met: healthyRatio >= 0.999,
        measuredAt: now,
      },
      {
        name: 'db_latency_ms',
        target: 100,
        actual: avgLatency,
        met: avgLatency < 100,
        measuredAt: now,
      },
    ];
  }
}
