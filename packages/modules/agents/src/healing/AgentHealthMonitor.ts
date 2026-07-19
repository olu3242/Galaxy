import { randomUUID } from 'node:crypto';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface AgentHealthRecord {
  agentId: string;
  organizationId: string;
  status: HealthStatus;
  lastHeartbeatAt: string;
  consecutiveFailures: number;
  errorRate: number; // 0-1 rolling window
  averageLatencyMs: number;
  metadata: Record<string, unknown>;
}

export interface HealthCheckResult {
  agentId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: string;
}

export interface HealingAction {
  id: string;
  agentId: string;
  type: 'restart' | 'reduce_load' | 'alert' | 'failover';
  triggeredAt: string;
  reason: string;
}

type HealthChecker = (agentId: string) => Promise<HealthCheckResult>;
type HealingHandler = (action: HealingAction) => void | Promise<void>;

const WINDOW_SIZE = 10;
const DEGRADED_THRESHOLD = 0.2; // 20% error rate
const UNHEALTHY_THRESHOLD = 0.5; // 50% error rate
const HEARTBEAT_TIMEOUT_MS = 30_000;

/**
 * AgentHealthMonitor — tracks agent liveness, computes health status, and
 * triggers self-healing actions when agents degrade or go offline.
 */
export class AgentHealthMonitor {
  private readonly records = new Map<string, AgentHealthRecord>();
  private readonly recentChecks = new Map<string, boolean[]>();
  private readonly healingHandlers: HealingHandler[] = [];

  /** Register an agent for health monitoring. */
  register(agentId: string, organizationId: string): void {
    this.records.set(agentId, {
      agentId,
      organizationId,
      status: 'unknown',
      lastHeartbeatAt: new Date().toISOString(),
      consecutiveFailures: 0,
      errorRate: 0,
      averageLatencyMs: 0,
      metadata: {},
    });
    this.recentChecks.set(agentId, []);
  }

  /** Record a health check result and update the agent's status. */
  recordCheck(result: HealthCheckResult): HealingAction | null {
    const record = this.records.get(result.agentId);
    if (!record) return null;

    record.lastHeartbeatAt = result.checkedAt;

    const window = this.recentChecks.get(result.agentId) ?? [];
    window.push(result.success);
    if (window.length > WINDOW_SIZE) window.shift();
    this.recentChecks.set(result.agentId, window);

    const failCount = window.filter((s) => !s).length;
    record.errorRate = failCount / window.length;
    record.consecutiveFailures = result.success ? 0 : record.consecutiveFailures + 1;

    // Update rolling average latency
    record.averageLatencyMs =
      record.averageLatencyMs === 0
        ? result.latencyMs
        : record.averageLatencyMs * 0.8 + result.latencyMs * 0.2;

    const previousStatus = record.status;

    if (record.errorRate >= UNHEALTHY_THRESHOLD) {
      record.status = 'unhealthy';
    } else if (record.errorRate >= DEGRADED_THRESHOLD) {
      record.status = 'degraded';
    } else {
      record.status = 'healthy';
    }

    // Trigger healing if status worsened
    if (previousStatus !== record.status && record.status !== 'healthy') {
      return this.triggerHealing(record);
    }

    return null;
  }

  /** Perform a health check using the provided checker function. */
  async checkAgent(agentId: string, checker: HealthChecker): Promise<HealthCheckResult> {
    const start = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      const result = await checker(agentId);
      this.recordCheck(result);
      return result;
    } catch (err) {
      const result: HealthCheckResult = {
        agentId,
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
      this.recordCheck(result);
      return result;
    }
  }

  /** Register a handler that fires when a healing action is triggered. */
  onHealingAction(handler: HealingHandler): void {
    this.healingHandlers.push(handler);
  }

  /** Check for stale heartbeats and mark agents unhealthy. */
  checkHeartbeats(): HealingAction[] {
    const actions: HealingAction[] = [];
    const now = Date.now();

    for (const record of this.records.values()) {
      const age = now - new Date(record.lastHeartbeatAt).getTime();
      if (age > HEARTBEAT_TIMEOUT_MS && record.status !== 'unhealthy') {
        record.status = 'unhealthy';
        actions.push(this.triggerHealing(record));
      }
    }

    return actions;
  }

  getHealth(agentId: string): AgentHealthRecord | undefined {
    return this.records.get(agentId);
  }

  getAllHealth(): AgentHealthRecord[] {
    return Array.from(this.records.values());
  }

  private triggerHealing(record: AgentHealthRecord): HealingAction {
    const actionType: HealingAction['type'] =
      record.status === 'unhealthy'
        ? record.consecutiveFailures >= 3
          ? 'restart'
          : 'failover'
        : 'reduce_load';

    const action: HealingAction = {
      id: randomUUID(),
      agentId: record.agentId,
      type: actionType,
      triggeredAt: new Date().toISOString(),
      reason: `Agent entered ${record.status} state (error rate: ${(record.errorRate * 100).toFixed(1)}%, consecutive failures: ${String(record.consecutiveFailures)})`,
    };

    for (const handler of this.healingHandlers) {
      void handler(action);
    }

    return action;
  }
}
