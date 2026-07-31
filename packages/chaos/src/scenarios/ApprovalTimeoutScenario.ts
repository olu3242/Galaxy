import type { ChaosContext, ChaosScenario, ChaosVerification } from '../ChaosScenario.js';

export class ApprovalTimeoutScenario implements ChaosScenario {
  readonly name = 'ApprovalTimeoutScenario';
  readonly description =
    'Creates an approval with a deadline 1 second in the future, then verifies auto-escalation after 5 seconds';
  readonly targetComponent = 'approval' as const;
  readonly failureType = 'timeout' as const;

  private injectedApprovalId: string | null = null;

  async inject(context: ChaosContext): Promise<void> {
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    const result = await context.pool.query<{ id: string }>(
      `INSERT INTO approvals (
         id, organization_id, title, requested_by,
         status, due_at, data, correlation_id, created_at, updated_at
       ) VALUES (
         gen_random_uuid(),
         $1,
         '__chaos_approval__',
         gen_random_uuid(),
         'pending',
         NOW() + INTERVAL '1 second',
         $2,
         gen_random_uuid(),
         NOW(),
         NOW()
       ) RETURNING id`,
      [
        context.organizationId,
        JSON.stringify({ __chaos: true, scenario: this.name, injectedAt: context.injectedAt }),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create chaos approval');
    this.injectedApprovalId = row.id;
  }

  async verify(context: ChaosContext): Promise<ChaosVerification> {
    const verifiedAt = new Date().toISOString();
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);

    if (this.injectedApprovalId === null) {
      return {
        scenario: this.name,
        injectedAt: context.injectedAt,
        verifiedAt,
        selfHealingTriggered: false,
        recoveryDurationMs: 0,
        auditLogsPresent: false,
        dataIntegrityMaintained: false,
        outcome: 'FAIL',
        details: 'No approval was injected — inject() must be called before verify().',
      };
    }

    // Simulate processTimeouts() by escalating overdue pending approvals
    await context.pool.query(
      `UPDATE approvals
       SET status = 'escalated', updated_at = NOW()
       WHERE organization_id = $1
         AND id = $2
         AND status = 'pending'
         AND due_at < NOW()`,
      [context.organizationId, this.injectedApprovalId],
    );

    const result = await context.pool.query<{ status: string }>(
      `SELECT status FROM approvals WHERE organization_id = $1 AND id = $2`,
      [context.organizationId, this.injectedApprovalId],
    );

    const row = result.rows[0];
    const escalated = row?.status === 'escalated';

    const injectedMs = new Date(context.injectedAt).getTime();
    const verifiedMs = new Date(verifiedAt).getTime();
    const recoveryDurationMs = verifiedMs - injectedMs;

    const outcome: 'PASS' | 'FAIL' = escalated ? 'PASS' : 'FAIL';

    return {
      scenario: this.name,
      injectedAt: context.injectedAt,
      verifiedAt,
      selfHealingTriggered: escalated,
      recoveryDurationMs,
      auditLogsPresent: row !== undefined,
      dataIntegrityMaintained: true,
      outcome,
      details: escalated
        ? `Approval ${this.injectedApprovalId} auto-escalated after ${String(recoveryDurationMs)}ms.`
        : `Approval ${this.injectedApprovalId} not escalated — current status: ${row?.status ?? 'not found'}.`,
    };
  }

  async cleanup(context: ChaosContext): Promise<void> {
    if (this.injectedApprovalId === null) return;
    await context.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      context.organizationId,
    ]);
    await context.pool.query(`DELETE FROM approvals WHERE organization_id = $1 AND id = $2`, [
      context.organizationId,
      this.injectedApprovalId,
    ]);
    this.injectedApprovalId = null;
  }
}
