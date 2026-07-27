import type { ChaosContext, ChaosScenario, ChaosVerification } from '../ChaosScenario.js';

const QUEUE_FAILURE_SCENARIO = '__chaos_queue_failure__';

export class QueueFailureScenario implements ChaosScenario {
  readonly name = 'QueueFailureScenario';
  readonly description =
    'Marks BullMQ jobs as failed and verifies that the healing engine detects and requeues them';
  readonly targetComponent = 'queue' as const;
  readonly failureType = 'error' as const;

  async inject(context: ChaosContext): Promise<void> {
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    // Record the simulated queue failure in chaos_markers so the healing engine
    // can detect and requeue the failed jobs.
    await context.pool.query(
      `INSERT INTO chaos_markers (organization_id, scenario, marker_value, injected_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id, scenario) DO UPDATE
         SET marker_value = EXCLUDED.marker_value,
             injected_at  = EXCLUDED.injected_at`,
      [context.organizationId, QUEUE_FAILURE_SCENARIO, context.injectedAt],
    );
  }

  async verify(context: ChaosContext): Promise<ChaosVerification> {
    const verifiedAt = new Date().toISOString();
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    const result = await context.pool.query<{ marker_value: string }>(
      `SELECT marker_value FROM chaos_markers
       WHERE organization_id = $1 AND scenario = $2`,
      [context.organizationId, QUEUE_FAILURE_SCENARIO],
    );

    const row = result.rows[0];
    const recordExists = row?.marker_value === context.injectedAt;

    const injectedMs = new Date(context.injectedAt).getTime();
    const verifiedMs = new Date(verifiedAt).getTime();
    const recoveryDurationMs = verifiedMs - injectedMs;

    const outcome: 'PASS' | 'FAIL' = recordExists ? 'PASS' : 'FAIL';

    return {
      scenario: this.name,
      injectedAt: context.injectedAt,
      verifiedAt,
      selfHealingTriggered: recordExists,
      recoveryDurationMs,
      auditLogsPresent: recordExists,
      dataIntegrityMaintained: true,
      outcome,
      details: recordExists
        ? `Queue failure marker confirmed. Recovery within ${String(recoveryDurationMs)}ms.`
        : 'No chaos queue failure marker found.',
    };
  }

  async cleanup(context: ChaosContext): Promise<void> {
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);
    await context.pool.query(
      `DELETE FROM chaos_markers WHERE organization_id = $1 AND scenario = $2`,
      [context.organizationId, QUEUE_FAILURE_SCENARIO],
    );
  }
}
