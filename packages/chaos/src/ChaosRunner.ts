import type { Pool } from 'pg';
import type { ChaosScenario, ChaosVerification } from './ChaosScenario.js';
import { QueueFailureScenario } from './scenarios/QueueFailureScenario.js';
import { DatabaseLatencyScenario } from './scenarios/DatabaseLatencyScenario.js';
import { ApprovalTimeoutScenario } from './scenarios/ApprovalTimeoutScenario.js';
import { AgentCrashScenario } from './scenarios/AgentCrashScenario.js';
import { KnowledgeServiceOutage } from './scenarios/KnowledgeServiceOutage.js';

export interface ChaosReport {
  runAt: string;
  organizationId: string;
  totalScenarios: number;
  passed: number;
  failed: number;
  scenarios: ChaosVerification[];
  overallOutcome: 'PASS' | 'FAIL' | 'PARTIAL';
}

export class ChaosRunner {
  private readonly defaultScenarios: ChaosScenario[];

  constructor(private readonly pool: Pool) {
    this.defaultScenarios = [
      new QueueFailureScenario(),
      new DatabaseLatencyScenario(),
      new ApprovalTimeoutScenario(),
      new AgentCrashScenario(),
      new KnowledgeServiceOutage(),
    ];
  }

  async run(scenario: ChaosScenario, organizationId: string): Promise<ChaosVerification> {
    const injectedAt = new Date().toISOString();
    const context = { organizationId, pool: this.pool, injectedAt };

    try {
      await scenario.inject(context);
    } catch (err) {
      await this.safeCleanup(scenario, context);
      return {
        scenario: scenario.name,
        injectedAt,
        verifiedAt: new Date().toISOString(),
        selfHealingTriggered: false,
        recoveryDurationMs: 0,
        auditLogsPresent: false,
        dataIntegrityMaintained: false,
        outcome: 'FAIL',
        details: `inject() threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let verification: ChaosVerification;
    try {
      verification = await scenario.verify(context);
    } catch (err) {
      verification = {
        scenario: scenario.name,
        injectedAt,
        verifiedAt: new Date().toISOString(),
        selfHealingTriggered: false,
        recoveryDurationMs: 0,
        auditLogsPresent: false,
        dataIntegrityMaintained: false,
        outcome: 'FAIL',
        details: `verify() threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    await this.safeCleanup(scenario, context);
    return verification;
  }

  async runAll(organizationId: string): Promise<ChaosReport> {
    const runAt = new Date().toISOString();
    const results: ChaosVerification[] = [];

    for (const scenario of this.defaultScenarios) {
      const result = await this.run(scenario, organizationId);
      results.push(result);
    }

    const passed = results.filter((r) => r.outcome === 'PASS').length;
    const failed = results.filter((r) => r.outcome === 'FAIL').length;

    let overallOutcome: 'PASS' | 'FAIL' | 'PARTIAL';
    if (failed === 0) {
      overallOutcome = 'PASS';
    } else if (passed === 0) {
      overallOutcome = 'FAIL';
    } else {
      overallOutcome = 'PARTIAL';
    }

    return {
      runAt,
      organizationId,
      totalScenarios: results.length,
      passed,
      failed,
      scenarios: results,
      overallOutcome,
    };
  }

  private async safeCleanup(
    scenario: ChaosScenario,
    context: { organizationId: string; pool: Pool; injectedAt: string },
  ): Promise<void> {
    try {
      await scenario.cleanup(context);
    } catch {
      // Cleanup failures are non-fatal — log in production environments.
    }
  }
}
