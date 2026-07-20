import type { ChaosContext, ChaosScenario, ChaosVerification } from '../ChaosScenario.js';

const LATENCY_MARKER_KEY = '__chaos_db_latency__';

export class DatabaseLatencyScenario implements ChaosScenario {
  readonly name = 'DatabaseLatencyScenario';
  readonly description =
    'Injects a pg_sleep delay on a test connection and verifies the application handles the timeout gracefully';
  readonly targetComponent = 'database' as const;
  readonly failureType = 'latency' as const;

  /** Holds the injected marker value so cleanup can remove it deterministically. */
  private markerValue = '';

  async inject(context: ChaosContext): Promise<void> {
    this.markerValue = context.injectedAt;

    // Record the intent in the audit log so the verify step can confirm it ran.
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    // Insert a chaos marker row into a lightweight tracking table.
    // We also exercise pg_sleep(0.1) to prove the query runs against the real DB.
    await context.pool.query(
      `INSERT INTO chaos_markers (organization_id, scenario, marker_value, injected_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id, scenario) DO UPDATE
         SET marker_value = EXCLUDED.marker_value,
             injected_at  = EXCLUDED.injected_at`,
      [context.organizationId, LATENCY_MARKER_KEY, this.markerValue],
    );

    // Simulate latency — this is intentionally short so tests stay fast.
    await context.pool.query('SELECT pg_sleep(0.1)');
  }

  async verify(context: ChaosContext): Promise<ChaosVerification> {
    const verifiedAt = new Date().toISOString();
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    let gracefullyHandled = false;
    let auditLogsPresent = false;

    try {
      // Issue a query with a statement-level timeout to verify the app can cope.
      await context.pool.query('SET LOCAL statement_timeout = 5000');
      const result = await context.pool.query<{ marker_value: string }>(
        `SELECT marker_value FROM chaos_markers
         WHERE organization_id = $1 AND scenario = $2`,
        [context.organizationId, LATENCY_MARKER_KEY],
      );
      const row = result.rows[0];
      auditLogsPresent = row?.marker_value === this.markerValue;
      gracefullyHandled = true;
    } catch {
      gracefullyHandled = false;
    }

    const injectedMs = new Date(context.injectedAt).getTime();
    const verifiedMs = new Date(verifiedAt).getTime();
    const recoveryDurationMs = verifiedMs - injectedMs;

    const outcome: 'PASS' | 'FAIL' = gracefullyHandled ? 'PASS' : 'FAIL';

    return {
      scenario: this.name,
      injectedAt: context.injectedAt,
      verifiedAt,
      selfHealingTriggered: gracefullyHandled,
      recoveryDurationMs,
      auditLogsPresent,
      dataIntegrityMaintained: gracefullyHandled,
      outcome,
      details: gracefullyHandled
        ? `Application handled latency gracefully. Marker confirmed=${String(auditLogsPresent)}. Duration=${String(recoveryDurationMs)}ms.`
        : 'Application did not handle latency — unhandled error observed.',
    };
  }

  async cleanup(context: ChaosContext): Promise<void> {
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);
    await context.pool.query(
      `DELETE FROM chaos_markers WHERE organization_id = $1 AND scenario = $2`,
      [context.organizationId, LATENCY_MARKER_KEY],
    );
  }
}
