import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';

import { PolicyService } from '../policies/PolicyService.js';
import { ComplianceCheckService } from '../compliance/ComplianceCheckService.js';
import { DataRetentionService } from '../retention/DataRetentionService.js';
import { ComplianceReportService } from '../reports/ComplianceReportService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok<T extends object>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function makePool(responses: QueryResult[]): Pool {
  let call = 0;
  return {
    query: vi.fn(() => {
      const resp = responses[call] ?? ok([]);
      call++;
      return Promise.resolve(resp);
    }),
  } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG = 'org-uuid-1111';
const POLICY_ID = 'policy-uuid-aaaa';
const USER_ID = 'user-uuid-cccc';

const policyRow = {
  id: POLICY_ID,
  organization_id: ORG,
  name: 'Test Policy',
  description: 'A policy for testing',
  policy_type: 'access_control',
  status: 'active',
  config: {},
  created_by: USER_ID,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const policyRuleRow = {
  id: 'rule-uuid-dddd',
  policy_id: POLICY_ID,
  organization_id: ORG,
  name: 'Rule 1',
  condition: { field: 'role', operator: 'equals', value: 'admin' },
  action: 'allow',
  priority: 1,
  is_active: true,
  created_at: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// PolicyService
// ---------------------------------------------------------------------------

describe('PolicyService', () => {
  describe('createPolicy', () => {
    it('sets tenant context then inserts the policy', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.createPolicy({
        organizationId: ORG,
        name: 'Test Policy',
        policyType: 'access_control',
        createdBy: USER_ID,
        description: 'A policy for testing',
      });

      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
      expect(result.id).toBe(POLICY_ID);
      expect(result.organizationId).toBe(ORG);
      expect(result.policyType).toBe('access_control');
      expect(result.status).toBe('active');
    });

    it('throws when the INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);

      await expect(
        svc.createPolicy({
          organizationId: ORG,
          name: 'Bad Insert',
          policyType: 'data_retention',
          createdBy: USER_ID,
        }),
      ).rejects.toThrow('Insert returned no row');
    });

    it('passes null description when omitted', async () => {
      const rowNoDesc = { ...policyRow, description: null };
      const pool = makePool([ok([]), ok([rowNoDesc])]);
      const svc = new PolicyService(pool);

      const result = await svc.createPolicy({
        organizationId: ORG,
        name: 'No Desc',
        policyType: 'workflow_approval',
        createdBy: USER_ID,
      });

      expect(result.description).toBeNull();
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO governance_policies'),
        expect.arrayContaining([null]),
      );
    });
  });

  describe('getPolicy', () => {
    it('returns the policy when found', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.getPolicy(ORG, POLICY_ID);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(POLICY_ID);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);

      const result = await svc.getPolicy(ORG, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listPolicies', () => {
    it('lists all policies for the org', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.listPolicies(ORG);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Test Policy');
    });

    it('filters by policyType and status', async () => {
      const pool = makePool([ok([]), ok([policyRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.listPolicies(ORG, {
        policyType: 'access_control',
        status: 'active',
      });

      expect(result).toHaveLength(1);
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('policy_type'),
        expect.arrayContaining([ORG, 'access_control', 'active']),
      );
    });

    it('returns empty array when org has no policies', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);

      const result = await svc.listPolicies(ORG);
      expect(result).toEqual([]);
    });
  });

  describe('updatePolicy', () => {
    it('updates the policy and returns it', async () => {
      const updatedRow = { ...policyRow, name: 'Updated Name', status: 'inactive' };
      const pool = makePool([ok([]), ok([updatedRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.updatePolicy(ORG, POLICY_ID, {
        name: 'Updated Name',
        status: 'inactive',
      });

      expect(result?.name).toBe('Updated Name');
      expect(result?.status).toBe('inactive');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('returns null when policy not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new PolicyService(pool);

      const result = await svc.updatePolicy(ORG, 'non-existent', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deletePolicy', () => {
    it('returns true when a row is deleted', async () => {
      const deleteResult: QueryResult = {
        rows: [],
        rowCount: 1,
        command: 'DELETE',
        oid: 0,
        fields: [],
      };
      const pool = makePool([ok([]), deleteResult]);
      const svc = new PolicyService(pool);

      const deleted = await svc.deletePolicy(ORG, POLICY_ID);
      expect(deleted).toBe(true);
    });

    it('returns false when no row matched', async () => {
      const deleteResult: QueryResult = {
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: [],
      };
      const pool = makePool([ok([]), deleteResult]);
      const svc = new PolicyService(pool);

      const deleted = await svc.deletePolicy(ORG, 'ghost');
      expect(deleted).toBe(false);
    });
  });

  describe('createPolicyRule', () => {
    it('sets tenant context then inserts the rule', async () => {
      const pool = makePool([ok([]), ok([policyRuleRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.createPolicyRule({
        policyId: POLICY_ID,
        organizationId: ORG,
        name: 'Rule 1',
        condition: { field: 'role', operator: 'equals', value: 'admin' },
        action: 'allow',
        priority: 1,
      });

      expect(result.policyId).toBe(POLICY_ID);
      expect(result.isActive).toBe(true);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('defaults priority to 0 when not provided', async () => {
      const pool = makePool([ok([]), ok([{ ...policyRuleRow, priority: 0 }])]);
      const svc = new PolicyService(pool);

      await svc.createPolicyRule({
        policyId: POLICY_ID,
        organizationId: ORG,
        name: 'Default Priority Rule',
        condition: {},
        action: 'deny',
      });

      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO policy_rules'),
        expect.arrayContaining([0]),
      );
    });
  });

  describe('listPolicyRules', () => {
    it('returns rules ordered by priority', async () => {
      const pool = makePool([ok([]), ok([policyRuleRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.listPolicyRules(ORG, POLICY_ID);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Rule 1');
    });
  });

  describe('evaluatePolicy', () => {
    it('returns allowed when all active rules pass', async () => {
      // evaluatePolicy calls listPolicyRules which issues: set_config + SELECT
      const pool = makePool([ok([]), ok([policyRuleRow])]);
      const svc = new PolicyService(pool);

      const result = await svc.evaluatePolicy(ORG, POLICY_ID, { role: 'admin' });
      expect(result.allowed).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns violations when a rule fails', async () => {
      const pool = makePool([ok([]), ok([policyRuleRow])]);
      const svc = new PolicyService(pool);

      // rule requires role === 'admin', but context has role === 'viewer'
      const result = await svc.evaluatePolicy(ORG, POLICY_ID, { role: 'viewer' });
      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain('Rule "Rule 1" violated');
    });

    it('skips inactive rules', async () => {
      const inactiveRule = { ...policyRuleRow, is_active: false };
      const pool = makePool([ok([]), ok([inactiveRule])]);
      const svc = new PolicyService(pool);

      const result = await svc.evaluatePolicy(ORG, POLICY_ID, { role: 'viewer' });
      expect(result.allowed).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('handles not_equals operator', async () => {
      const rule = {
        ...policyRuleRow,
        condition: { field: 'status', operator: 'not_equals', value: 'banned' },
      };
      const pool = makePool([ok([]), ok([rule])]);
      const svc = new PolicyService(pool);

      const pass = await svc.evaluatePolicy(ORG, POLICY_ID, { status: 'active' });
      expect(pass.allowed).toBe(true);

      const pool2 = makePool([ok([]), ok([rule])]);
      const svc2 = new PolicyService(pool2);
      const fail = await svc2.evaluatePolicy(ORG, POLICY_ID, { status: 'banned' });
      expect(fail.allowed).toBe(false);
    });

    it('handles greater_than and less_than operators', async () => {
      const gtRule = {
        ...policyRuleRow,
        condition: { field: 'amount', operator: 'greater_than', value: 1000 },
      };
      const pool = makePool([ok([]), ok([gtRule])]);
      const svc = new PolicyService(pool);

      const pass = await svc.evaluatePolicy(ORG, POLICY_ID, { amount: 2000 });
      expect(pass.allowed).toBe(true);

      const pool2 = makePool([ok([]), ok([gtRule])]);
      const svc2 = new PolicyService(pool2);
      const fail = await svc2.evaluatePolicy(ORG, POLICY_ID, { amount: 500 });
      expect(fail.allowed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// ComplianceCheckService
// ---------------------------------------------------------------------------

describe('ComplianceCheckService', () => {
  const checkRow = {
    id: 'check-uuid-1111',
    organization_id: ORG,
    check_type: 'missing_approvals',
    status: 'pass',
    details: { checkedAt: '2024-01-01T00:00:00.000Z', violationCount: 0 },
    violations: [],
    run_at: '2024-01-01T00:00:00.000Z',
    run_by: USER_ID,
  };

  describe('getCheck', () => {
    it('sets tenant context and returns the check', async () => {
      const pool = makePool([ok([]), ok([checkRow])]);
      const svc = new ComplianceCheckService(pool);

      const result = await svc.getCheck(ORG, 'check-uuid-1111');
      expect(result?.checkType).toBe('missing_approvals');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('returns null when check not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ComplianceCheckService(pool);

      const result = await svc.getCheck(ORG, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listChecks', () => {
    it('lists checks with no filters', async () => {
      const pool = makePool([ok([]), ok([checkRow])]);
      const svc = new ComplianceCheckService(pool);

      const result = await svc.listChecks(ORG);
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('pass');
    });

    it('filters by checkType and status', async () => {
      const pool = makePool([ok([]), ok([checkRow])]);
      const svc = new ComplianceCheckService(pool);

      const result = await svc.listChecks(ORG, {
        checkType: 'missing_approvals',
        status: 'pass',
        limit: 10,
      });
      expect(result).toHaveLength(1);
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('check_type'),
        expect.arrayContaining([ORG, 'missing_approvals', 'pass', 10]),
      );
    });
  });

  describe('runChecks', () => {
    it('sets tenant context and runs all three sub-checks', async () => {
      // runChecks call sequence:
      // 1. set_config (top-level)
      // 2. checkMissingApprovals → workflows query
      // 3. checkMissingApprovals → saveCheck INSERT
      // 4. checkDataRetentionViolations → retention query
      // 5. checkDataRetentionViolations → saveCheck INSERT
      // 6. checkRbacMisconfigurations → roles query
      // 7. checkRbacMisconfigurations → saveCheck INSERT

      const savedCheck = (checkType: string, status: string) => ({
        id: `check-${checkType}`,
        organization_id: ORG,
        check_type: checkType,
        status,
        details: {},
        violations: [],
        run_at: '2024-01-01T00:00:00.000Z',
        run_by: USER_ID,
      });

      const pool = makePool([
        ok([]), // set_config
        ok([]), // missing_approvals workflows query (no violations)
        ok([savedCheck('missing_approvals', 'pass')]), // saveCheck INSERT
        ok([]), // data_retention query (no violations)
        ok([savedCheck('data_retention_violations', 'pass')]), // saveCheck INSERT
        ok([]), // rbac query (no violations)
        ok([savedCheck('rbac_misconfigurations', 'pass')]), // saveCheck INSERT
      ]);
      const svc = new ComplianceCheckService(pool);

      const results = await svc.runChecks(ORG, USER_ID);
      expect(results).toHaveLength(3);
      expect(results[0]?.checkType).toBe('missing_approvals');
      expect(results[1]?.checkType).toBe('data_retention_violations');
      expect(results[2]?.checkType).toBe('rbac_misconfigurations');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('records violations when workflows completed without approval', async () => {
      const savedFail = {
        id: 'check-fail',
        organization_id: ORG,
        check_type: 'missing_approvals',
        status: 'fail',
        details: {},
        violations: ['Workflow "Onboard" (wf-1) completed without approval'],
        run_at: '2024-01-01T00:00:00.000Z',
        run_by: USER_ID,
      };

      const pool = makePool([
        ok([]), // set_config
        ok([{ id: 'wf-1', title: 'Onboard' }]), // workflows missing approval
        ok([savedFail]), // saveCheck
        ok([]), // data_retention
        ok([
          {
            id: 'c2',
            organization_id: ORG,
            check_type: 'data_retention_violations',
            status: 'pass',
            details: {},
            violations: [],
            run_at: '',
            run_by: USER_ID,
          },
        ]),
        ok([]), // rbac
        ok([
          {
            id: 'c3',
            organization_id: ORG,
            check_type: 'rbac_misconfigurations',
            status: 'pass',
            details: {},
            violations: [],
            run_at: '',
            run_by: USER_ID,
          },
        ]),
      ]);
      const svc = new ComplianceCheckService(pool);

      const results = await svc.runChecks(ORG, USER_ID);
      expect(results[0]?.status).toBe('fail');
      expect(results[0]?.violations).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// DataRetentionService
// ---------------------------------------------------------------------------

describe('DataRetentionService', () => {
  const retentionRow = {
    id: 'drp-uuid-1111',
    organization_id: ORG,
    resource_type: 'audit_logs',
    retention_days: 90,
    action: 'flag',
    is_active: true,
    created_by: USER_ID,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  describe('createRetentionPolicy', () => {
    it('sets tenant context then inserts the policy', async () => {
      const pool = makePool([ok([]), ok([retentionRow])]);
      const svc = new DataRetentionService(pool);

      const result = await svc.createRetentionPolicy({
        organizationId: ORG,
        resourceType: 'audit_logs',
        retentionDays: 90,
        action: 'flag',
        createdBy: USER_ID,
      });

      expect(result.id).toBe('drp-uuid-1111');
      expect(result.retentionDays).toBe(90);
      expect(result.action).toBe('flag');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new DataRetentionService(pool);

      await expect(
        svc.createRetentionPolicy({
          organizationId: ORG,
          resourceType: 'messages',
          retentionDays: 30,
          action: 'delete',
          createdBy: USER_ID,
        }),
      ).rejects.toThrow('INSERT INTO data_retention_policies returned no row');
    });
  });

  describe('getRetentionPolicy', () => {
    it('returns policy when found', async () => {
      const pool = makePool([ok([]), ok([retentionRow])]);
      const svc = new DataRetentionService(pool);

      const result = await svc.getRetentionPolicy(ORG, 'drp-uuid-1111');
      expect(result?.resourceType).toBe('audit_logs');
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new DataRetentionService(pool);

      const result = await svc.getRetentionPolicy(ORG, 'ghost');
      expect(result).toBeNull();
    });
  });

  describe('listRetentionPolicies', () => {
    it('returns all policies for the org', async () => {
      const pool = makePool([ok([]), ok([retentionRow])]);
      const svc = new DataRetentionService(pool);

      const result = await svc.listRetentionPolicies(ORG);
      expect(result).toHaveLength(1);
      expect(result[0]?.isActive).toBe(true);
    });
  });

  describe('updateRetentionPolicy', () => {
    it('updates retention days and returns updated policy', async () => {
      const updatedRow = { ...retentionRow, retention_days: 180, is_active: false };
      const pool = makePool([ok([]), ok([updatedRow])]);
      const svc = new DataRetentionService(pool);

      const result = await svc.updateRetentionPolicy(ORG, 'drp-uuid-1111', {
        retentionDays: 180,
        isActive: false,
      });

      expect(result?.retentionDays).toBe(180);
      expect(result?.isActive).toBe(false);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('returns null when policy not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new DataRetentionService(pool);

      const result = await svc.updateRetentionPolicy(ORG, 'ghost', { isActive: false });
      expect(result).toBeNull();
    });
  });

  describe('enforceRetentionPolicies', () => {
    it('sets tenant context and skips inactive policies', async () => {
      const inactiveRow = { ...retentionRow, is_active: false };

      // enforceRetentionPolicies:
      // 1. set_config (top-level)
      // 2. listRetentionPolicies → set_config + SELECT
      const pool = makePool([ok([]), ok([]), ok([inactiveRow])]);
      const svc = new DataRetentionService(pool);

      const results = await svc.enforceRetentionPolicies(ORG);
      expect(results).toEqual([]);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('flags records and returns count for flag action', async () => {
      // Calls: set_config, listRetentionPolicies (set_config + SELECT), COUNT query
      const pool = makePool([
        ok([]), // top-level set_config
        ok([]), // listRetentionPolicies set_config
        ok([retentionRow]), // listRetentionPolicies SELECT
        ok([{ count: '42' }]), // flag COUNT query
      ]);
      const svc = new DataRetentionService(pool);

      const results = await svc.enforceRetentionPolicies(ORG);
      expect(results).toHaveLength(1);
      expect(results[0]?.action).toBe('flag');
      expect(results[0]?.recordsAffected).toBe(42);
      expect(results[0]?.resourceType).toBe('audit_logs');
    });

    it('handles archive action with 0 records affected', async () => {
      const archiveRow = { ...retentionRow, action: 'archive' };
      const pool = makePool([
        ok([]), // top-level set_config
        ok([]), // listRetentionPolicies set_config
        ok([archiveRow]), // listRetentionPolicies SELECT
        // no COUNT query for archive
      ]);
      const svc = new DataRetentionService(pool);

      const results = await svc.enforceRetentionPolicies(ORG);
      expect(results).toHaveLength(1);
      expect(results[0]?.action).toBe('archive');
      expect(results[0]?.recordsAffected).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ComplianceReportService
// ---------------------------------------------------------------------------

describe('ComplianceReportService', () => {
  const reportRow = {
    id: 'report-uuid-1111',
    organization_id: ORG,
    period_start: '2024-01-01T00:00:00.000Z',
    period_end: '2024-01-31T23:59:59.000Z',
    total_checks: 10,
    passed: 8,
    failed: 1,
    warnings: 1,
    summary: { checkTypeSummary: {} },
    generated_by: USER_ID,
    generated_at: '2024-02-01T00:00:00.000Z',
  };

  describe('generateReport', () => {
    it('sets tenant context, aggregates checks, and inserts report', async () => {
      const checksRows = [
        { status: 'pass', check_type: 'missing_approvals', cnt: '8' },
        { status: 'fail', check_type: 'missing_approvals', cnt: '1' },
        { status: 'warning', check_type: 'data_retention_violations', cnt: '1' },
      ];

      const pool = makePool([ok([]), ok(checksRows), ok([reportRow])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.generateReport(
        ORG,
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.000Z',
        USER_ID,
      );

      expect(result.id).toBe('report-uuid-1111');
      expect(result.totalChecks).toBe(10);
      expect(result.passed).toBe(8);
      expect(result.failed).toBe(1);
      expect(result.warnings).toBe(1);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('throws when INSERT returns no row', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new ComplianceReportService(pool);

      await expect(svc.generateReport(ORG, '2024-01-01', '2024-01-31', USER_ID)).rejects.toThrow(
        'INSERT INTO compliance_reports returned no row',
      );
    });

    it('produces totalChecks = 0 when period has no checks', async () => {
      const pool = makePool([
        ok([]),
        ok([]),
        ok([{ ...reportRow, total_checks: 0, passed: 0, failed: 0, warnings: 0 }]),
      ]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.generateReport(ORG, '2024-03-01', '2024-03-31', USER_ID);
      expect(result.totalChecks).toBe(0);
    });
  });

  describe('getReport', () => {
    it('returns report when found', async () => {
      const pool = makePool([ok([]), ok([reportRow])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.getReport(ORG, 'report-uuid-1111');
      expect(result?.generatedBy).toBe(USER_ID);
    });

    it('returns null when not found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.getReport(ORG, 'ghost');
      expect(result).toBeNull();
    });
  });

  describe('listReports', () => {
    it('returns reports for the org', async () => {
      const pool = makePool([ok([]), ok([reportRow])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.listReports(ORG);
      expect(result).toHaveLength(1);
      expect(result[0]?.organizationId).toBe(ORG);
    });

    it('respects limit option', async () => {
      const pool = makePool([ok([]), ok([reportRow])]);
      const svc = new ComplianceReportService(pool);

      await svc.listReports(ORG, { limit: 5 });
      expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT'), [ORG, 5]);
    });
  });

  describe('exportAuditTrail', () => {
    const auditLogRow = {
      id: 'audit-uuid-1111',
      actor_id: USER_ID,
      actor_type: 'member',
      action: 'workflow.submitted',
      resource_type: 'workflow',
      resource_id: 'wf-uuid-1111',
      metadata: { note: 'test' },
      created_at: '2024-01-15T10:00:00.000Z',
    };

    it('sets tenant context and returns structured export', async () => {
      const pool = makePool([ok([]), ok([auditLogRow])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.exportAuditTrail(
        ORG,
        '2024-01-01T00:00:00.000Z',
        '2024-01-31T23:59:59.000Z',
        USER_ID,
      );

      expect(result.organizationId).toBe(ORG);
      expect(result.exportedBy).toBe(USER_ID);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.actorType).toBe('member');
      expect(result.entries[0]?.action).toBe('workflow.submitted');
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        ORG,
      ]);
    });

    it('returns empty entries when no audit logs in period', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.exportAuditTrail(
        ORG,
        '2024-06-01T00:00:00.000Z',
        '2024-06-30T23:59:59.000Z',
        USER_ID,
      );

      expect(result.entries).toEqual([]);
      expect(result.exportedAt).toBeTruthy();
    });

    it('maps all audit log fields correctly', async () => {
      const pool = makePool([ok([]), ok([auditLogRow])]);
      const svc = new ComplianceReportService(pool);

      const result = await svc.exportAuditTrail(ORG, '2024-01-01', '2024-01-31', USER_ID);
      const entry = result.entries[0];

      expect(entry?.id).toBe('audit-uuid-1111');
      expect(entry?.actorId).toBe(USER_ID);
      expect(entry?.resourceType).toBe('workflow');
      expect(entry?.resourceId).toBe('wf-uuid-1111');
      expect(entry?.metadata).toEqual({ note: 'test' });
      expect(entry?.createdAt).toBe('2024-01-15T10:00:00.000Z');
    });
  });
});
