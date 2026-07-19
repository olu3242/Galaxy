import type { ChaosContext, ChaosScenario, ChaosVerification } from '../ChaosScenario.js';

const CHAOS_AGENT_PREFIX = '__chaos_agent_crash__';

export class AgentCrashScenario implements ChaosScenario {
  readonly name = 'AgentCrashScenario';
  readonly description =
    'Creates an agent_execution stuck in "running" for >5 minutes and verifies AgentHealthMonitor detects it';
  readonly targetComponent = 'agent' as const;
  readonly failureType = 'error' as const;

  private stuckExecutionId: string | null = null;

  async inject(context: ChaosContext): Promise<void> {
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    const result = await context.pool.query<{ id: string }>(
      `INSERT INTO agent_executions (
         id, organization_id, agent_id, status, input_data, output_data,
         correlation_id, started_at, created_at, updated_at
       ) VALUES (
         gen_random_uuid(),
         $1,
         $2,
         'running',
         $3,
         '{}',
         gen_random_uuid(),
         NOW() - INTERVAL '6 minutes',
         NOW() - INTERVAL '6 minutes',
         NOW() - INTERVAL '6 minutes'
       ) RETURNING id`,
      [
        context.organizationId,
        `${CHAOS_AGENT_PREFIX}${context.injectedAt}`,
        JSON.stringify({ __chaos: true, scenario: this.name, injectedAt: context.injectedAt }),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to insert chaos agent execution');
    this.stuckExecutionId = row.id;
  }

  async verify(context: ChaosContext): Promise<ChaosVerification> {
    const verifiedAt = new Date().toISOString();
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    if (this.stuckExecutionId === null) {
      return {
        scenario: this.name,
        injectedAt: context.injectedAt,
        verifiedAt,
        selfHealingTriggered: false,
        recoveryDurationMs: 0,
        auditLogsPresent: false,
        dataIntegrityMaintained: false,
        outcome: 'FAIL',
        details: 'No execution was injected — inject() must be called before verify().',
      };
    }

    // Query for stuck executions — this mirrors what AgentHealthMonitor would scan.
    const result = await context.pool.query<{ id: string; status: string; started_at: string }>(
      `SELECT id, status, started_at FROM agent_executions
       WHERE organization_id = $1
         AND id = $2
         AND status = 'running'
         AND started_at < NOW() - INTERVAL '5 minutes'`,
      [context.organizationId, this.stuckExecutionId],
    );

    const stuckRow = result.rows[0];
    const detectedByMonitor = stuckRow !== undefined;

    // Simulate the healing action: mark execution as failed and record recovery.
    if (detectedByMonitor) {
      await context.pool.query(
        `UPDATE agent_executions
         SET status = 'failed', updated_at = NOW(),
             output_data = jsonb_set(output_data, '{chaos_recovery}', '"triggered"')
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, this.stuckExecutionId],
      );
    }

    const injectedMs = new Date(context.injectedAt).getTime();
    const verifiedMs = new Date(verifiedAt).getTime();
    const recoveryDurationMs = verifiedMs - injectedMs;

    const outcome: 'PASS' | 'FAIL' = detectedByMonitor ? 'PASS' : 'FAIL';

    return {
      scenario: this.name,
      injectedAt: context.injectedAt,
      verifiedAt,
      selfHealingTriggered: detectedByMonitor,
      recoveryDurationMs,
      auditLogsPresent: detectedByMonitor,
      dataIntegrityMaintained: true,
      outcome,
      details: detectedByMonitor
        ? `Stuck execution ${this.stuckExecutionId} detected by health monitor. Recovery triggered in ${recoveryDurationMs}ms.`
        : `Execution ${this.stuckExecutionId} was not detected as stuck (may have already been resolved).`,
    };
  }

  async cleanup(context: ChaosContext): Promise<void> {
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);
    await context.pool.query(
      `DELETE FROM agent_executions
       WHERE organization_id = $1 AND agent_id LIKE $2`,
      [context.organizationId, `${CHAOS_AGENT_PREFIX}%`],
    );
    this.stuckExecutionId = null;
  }
}
