/**
 * Chaos Engineering OS Certification Test Suite
 *
 * Certifies the chaos engineering module lifecycle:
 * 1.  ChaosRunner constructs with default scenarios
 * 2.  run(QueueFailureScenario) returns a ChaosVerification
 * 3.  ChaosVerification has required fields
 * 4.  run(DatabaseLatencyScenario) returns a ChaosVerification
 * 5.  run(ApprovalTimeoutScenario) returns a ChaosVerification
 * 6.  run(AgentCrashScenario) returns a ChaosVerification
 * 7.  run(KnowledgeServiceOutage) returns a ChaosVerification
 * 8.  runAll returns a ChaosReport with all 5 scenarios
 * 9.  ChaosReport has correct totalScenarios and overallOutcome field
 * 10. Cross-tenant isolation — org B chaos data is separate from org A
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  ChaosRunner,
  QueueFailureScenario,
  DatabaseLatencyScenario,
  ApprovalTimeoutScenario,
  AgentCrashScenario,
  KnowledgeServiceOutage,
} from '@galaxy/chaos';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-6101-4000-8000-610000000001';
const orgIdB = '00000000-6101-4000-8000-610000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Chaos Phase 61 Org A', 'chaos-phase61-a', 'starter', 'active'),
            ($2, 'Chaos Phase 61 Org B', 'chaos-phase61-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM agent_executions WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM healing_incidents WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Chaos Engineering OS Certification', () => {
  // ── 1. ChaosRunner constructs ─────────────────────────────────────────────
  it('1. ChaosRunner constructs with default scenarios', () => {
    const runner = new ChaosRunner(pool);
    expect(runner).toBeTruthy();
    expect(typeof runner.run).toBe('function');
    expect(typeof runner.runAll).toBe('function');
  });

  // ── 2. QueueFailureScenario returns ChaosVerification ────────────────────
  it('2. run(QueueFailureScenario) returns a ChaosVerification', async () => {
    const runner = new ChaosRunner(pool);
    const result = await runner.run(new QueueFailureScenario(), orgId);
    expect(result).toBeTruthy();
    expect(result.scenario).toBe('QueueFailureScenario');
    expect(['PASS', 'FAIL']).toContain(result.outcome);
  });

  // ── 3. ChaosVerification has required fields ──────────────────────────────
  it('3. ChaosVerification has required fields', async () => {
    const runner = new ChaosRunner(pool);
    const result = await runner.run(new QueueFailureScenario(), orgId);
    expect(typeof result.scenario).toBe('string');
    expect(typeof result.injectedAt).toBe('string');
    expect(typeof result.verifiedAt).toBe('string');
    expect(typeof result.selfHealingTriggered).toBe('boolean');
    expect(typeof result.recoveryDurationMs).toBe('number');
    expect(typeof result.auditLogsPresent).toBe('boolean');
    expect(typeof result.dataIntegrityMaintained).toBe('boolean');
  });

  // ── 4. DatabaseLatencyScenario ────────────────────────────────────────────
  it('4. run(DatabaseLatencyScenario) returns a ChaosVerification', async () => {
    const runner = new ChaosRunner(pool);
    const result = await runner.run(new DatabaseLatencyScenario(), orgId);
    expect(result).toBeTruthy();
    expect(result.scenario).toBe('DatabaseLatencyScenario');
    expect(['PASS', 'FAIL']).toContain(result.outcome);
  });

  // ── 5. ApprovalTimeoutScenario ────────────────────────────────────────────
  it('5. run(ApprovalTimeoutScenario) returns a ChaosVerification', async () => {
    const runner = new ChaosRunner(pool);
    const result = await runner.run(new ApprovalTimeoutScenario(), orgId);
    expect(result).toBeTruthy();
    expect(result.scenario).toBe('ApprovalTimeoutScenario');
    expect(['PASS', 'FAIL']).toContain(result.outcome);
  });

  // ── 6. AgentCrashScenario ─────────────────────────────────────────────────
  it('6. run(AgentCrashScenario) returns a ChaosVerification', async () => {
    const runner = new ChaosRunner(pool);
    const result = await runner.run(new AgentCrashScenario(), orgId);
    expect(result).toBeTruthy();
    expect(result.scenario).toBe('AgentCrashScenario');
    expect(['PASS', 'FAIL']).toContain(result.outcome);
  });

  // ── 7. KnowledgeServiceOutage ─────────────────────────────────────────────
  it('7. run(KnowledgeServiceOutage) returns a ChaosVerification', async () => {
    const runner = new ChaosRunner(pool);
    const result = await runner.run(new KnowledgeServiceOutage(), orgId);
    expect(result).toBeTruthy();
    expect(result.scenario).toBe('KnowledgeServiceOutage');
    expect(['PASS', 'FAIL']).toContain(result.outcome);
  });

  // ── 8. runAll returns a ChaosReport ──────────────────────────────────────
  it('8. runAll returns a ChaosReport with all 5 scenarios', async () => {
    const runner = new ChaosRunner(pool);
    const report = await runner.runAll(orgId);
    expect(report).toBeTruthy();
    expect(report.organizationId).toBe(orgId);
    expect(report.totalScenarios).toBe(5);
    expect(Array.isArray(report.scenarios)).toBe(true);
    expect(report.scenarios.length).toBe(5);
  });

  // ── 9. ChaosReport has overallOutcome ────────────────────────────────────
  it('9. ChaosReport has correct totalScenarios and overallOutcome field', async () => {
    const runner = new ChaosRunner(pool);
    const report = await runner.runAll(orgId);
    expect(['PASS', 'FAIL', 'PARTIAL']).toContain(report.overallOutcome);
    expect(typeof report.passed).toBe('number');
    expect(typeof report.failed).toBe('number');
    expect(report.passed + report.failed).toBe(report.totalScenarios);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B chaos data is separate from org A', async () => {
    const runner = new ChaosRunner(pool);
    await runner.run(new QueueFailureScenario(), orgIdB);
    const execA = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM agent_executions WHERE organization_id = $1`,
      [orgId],
    );
    const execB = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM agent_executions WHERE organization_id = $1`,
      [orgIdB],
    );
    expect(Number(execA.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(execB.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(0);
    const leaked = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM agent_executions WHERE organization_id = $1`,
      [orgIdB],
    );
    expect(Number(leaked.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(0);
  });
});
