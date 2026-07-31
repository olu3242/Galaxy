import type { Pool } from 'pg';
import type {
  DependencyHealth,
  DependencyName,
  WorkstreamDependency,
  DependencyHealthMatrix,
} from '@galaxy/types';

interface PingResult {
  name: DependencyName;
  health: DependencyHealth;
  latencyMs: number | null;
  errorMessage: string | null;
}

/**
 * DependencyHealthService
 *
 * Pings each WRF dependency and returns a health matrix used by Mission Control
 * and the workstream self-healing engine to determine recovery actions.
 *
 * Each check is a lightweight probe — never a full integration test.
 */
export class DependencyHealthService {
  constructor(
    private readonly pool: Pool,
    private readonly redisUrl?: string,
  ) {}

  /**
   * Run all dependency probes and return a full health matrix.
   * Safe to call from admin endpoints — no RLS context needed.
   */
  async getHealthMatrix(organizationId: string): Promise<DependencyHealthMatrix> {
    const probes: (() => Promise<PingResult>)[] = [
      () => this.pingPostgres(),
      () => this.pingRedis(),
      () => this.pingWorkflowOS(),
      () => this.pingAgentOS(),
      () => this.pingKnowledgeOS(),
      () => this.pingAuditService(),
      () => this.pingNotificationEngine(),
      () => this.pingIdentityService(),
      () => this.pingOrganizationService(),
    ];

    const results = await Promise.allSettled(probes.map((p) => p()));
    const dependencies: WorkstreamDependency[] = results.map((r, i) => {
      const now = new Date().toISOString();
      if (r.status === 'fulfilled') {
        return {
          name: r.value.name,
          health: r.value.health,
          latencyMs: r.value.latencyMs,
          lastCheckedAt: now,
          errorMessage: r.value.errorMessage,
        };
      }
      const fallbackNames: DependencyName[] = [
        'postgresql',
        'redis',
        'workflow_os',
        'agent_os',
        'knowledge_os',
        'audit_service',
        'notification_engine',
        'identity_service',
        'organization_service',
      ];
      return {
        name: fallbackNames[i] ?? 'postgresql',
        health: 'unavailable',
        latencyMs: null,
        lastCheckedAt: now,
        errorMessage: String(r.reason),
      };
    });

    const overall = this.computeOverall(dependencies);

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      overall,
      dependencies,
    };
  }

  private computeOverall(deps: WorkstreamDependency[]): DependencyHealth {
    if (deps.some((d) => d.health === 'unavailable')) return 'unavailable';
    if (deps.some((d) => d.health === 'degraded')) return 'degraded';
    if (deps.some((d) => d.health === 'warning')) return 'warning';
    return 'healthy';
  }

  private async pingPostgres(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        name: 'postgresql',
        health: latencyMs > 500 ? 'warning' : 'healthy',
        latencyMs,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'postgresql',
        health: 'unavailable',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingRedis(): Promise<PingResult> {
    if (!this.redisUrl) {
      return {
        name: 'redis',
        health: 'warning',
        latencyMs: null,
        errorMessage: 'REDIS_URL not configured',
      };
    }
    const start = Date.now();
    try {
      // Dynamic import so the platform module doesn't hard-depend on ioredis
      const { Redis } = await import('ioredis');
      const client = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });
      await client.connect();
      await client.ping();
      const latencyMs = Date.now() - start;
      await client.quit();
      return {
        name: 'redis',
        health: latencyMs > 200 ? 'warning' : 'healthy',
        latencyMs,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'redis',
        health: 'unavailable',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingWorkflowOS(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(`SELECT COUNT(*) FROM workflow_runs WHERE status = 'running' LIMIT 1`);
      return {
        name: 'workflow_os',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'workflow_os',
        health: 'degraded',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingAgentOS(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(
        `SELECT COUNT(*) FROM autonomous_agents WHERE status = 'active' LIMIT 1`,
      );
      return {
        name: 'agent_os',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'agent_os',
        health: 'degraded',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingKnowledgeOS(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(
        `SELECT COUNT(*) FROM knowledge_documents WHERE status = 'published' LIMIT 1`,
      );
      return {
        name: 'knowledge_os',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'knowledge_os',
        health: 'degraded',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingAuditService(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(`SELECT 1 FROM audit_logs LIMIT 1`);
      return {
        name: 'audit_service',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'audit_service',
        health: 'degraded',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingNotificationEngine(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(`SELECT 1 FROM notifications LIMIT 1`);
      return {
        name: 'notification_engine',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'notification_engine',
        health: 'degraded',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingIdentityService(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(`SELECT 1 FROM users LIMIT 1`);
      return {
        name: 'identity_service',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'identity_service',
        health: 'unavailable',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }

  private async pingOrganizationService(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this.pool.query(`SELECT 1 FROM organizations LIMIT 1`);
      return {
        name: 'organization_service',
        health: 'healthy',
        latencyMs: Date.now() - start,
        errorMessage: null,
      };
    } catch (e) {
      return {
        name: 'organization_service',
        health: 'unavailable',
        latencyMs: null,
        errorMessage: String(e),
      };
    }
  }
}
