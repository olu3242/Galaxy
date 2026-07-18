import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TrialService } from '../subscriptions/TrialService.js';

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

const trialRow = {
  id: 'trial-1',
  organization_id: 'org-1',
  plan_id: 'plan-1',
  trial_start: '2024-01-01T00:00:00Z',
  trial_end: '2024-01-15T00:00:00Z',
  is_converted: false,
  converted_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const subRow = {
  id: 'sub-1',
  organization_id: 'org-1',
  plan_id: 'plan-1',
  status: 'active',
  current_period_start: '2024-01-15T00:00:00Z',
  current_period_end: '2024-02-15T00:00:00Z',
  cancel_at_period_end: false,
  trial_end: null,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
};

describe('TrialService', () => {
  describe('startTrial', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([trialRow]), ok([])]);
      const svc = new TrialService(pool);
      await svc.startTrial('org-1', 'plan-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
      expect(calls[0]?.[1]).toContain('org-1');
    });

    it('creates trial and returns mapped trial', async () => {
      const pool = makePool([ok([]), ok([trialRow]), ok([])]);
      const svc = new TrialService(pool);
      const trial = await svc.startTrial('org-1', 'plan-1');
      expect(trial.id).toBe('trial-1');
      expect(trial.organizationId).toBe('org-1');
      expect(trial.planId).toBe('plan-1');
      expect(trial.isConverted).toBe(false);
      expect(trial.convertedAt).toBeNull();
    });

    it('uses default trial days of 14', async () => {
      const pool = makePool([ok([]), ok([trialRow]), ok([])]);
      const svc = new TrialService(pool);
      await svc.startTrial('org-1', 'plan-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const insertParams = calls[1]?.[1] as unknown[];
      const trialStart = new Date(insertParams[2] as string);
      const trialEnd = new Date(insertParams[3] as string);
      const diffDays = Math.round((trialEnd.getTime() - trialStart.getTime()) / 86400000);
      expect(diffDays).toBe(14);
    });

    it('uses custom trial days when provided', async () => {
      const pool = makePool([ok([]), ok([trialRow]), ok([])]);
      const svc = new TrialService(pool);
      await svc.startTrial('org-1', 'plan-1', 30);
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      const insertParams = calls[1]?.[1] as unknown[];
      const trialStart = new Date(insertParams[2] as string);
      const trialEnd = new Date(insertParams[3] as string);
      const diffDays = Math.round((trialEnd.getTime() - trialStart.getTime()) / 86400000);
      expect(diffDays).toBe(30);
    });

    it('throws when trial insert returns no row', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TrialService(pool);
      await expect(svc.startTrial('org-1', 'plan-1')).rejects.toThrow('Trial creation failed');
    });

    it('creates a trialing subscription as second query', async () => {
      const pool = makePool([ok([]), ok([trialRow]), ok([])]);
      const svc = new TrialService(pool);
      await svc.startTrial('org-1', 'plan-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[2]?.[0]).toContain('INSERT INTO subscriptions');
    });
  });

  describe('getTrialStatus', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([trialRow])]);
      const svc = new TrialService(pool);
      await svc.getTrialStatus('org-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
    });

    it('returns trial when found', async () => {
      const pool = makePool([ok([]), ok([trialRow])]);
      const svc = new TrialService(pool);
      const trial = await svc.getTrialStatus('org-1');
      expect(trial?.id).toBe('trial-1');
      expect(trial?.isConverted).toBe(false);
    });

    it('returns null when no trial exists', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TrialService(pool);
      const trial = await svc.getTrialStatus('org-1');
      expect(trial).toBeNull();
    });

    it('passes orgId as parameter', async () => {
      const pool = makePool([ok([]), ok([trialRow])]);
      const svc = new TrialService(pool);
      await svc.getTrialStatus('org-42');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[1]).toContain('org-42');
    });
  });

  describe('convertTrialToPaid', () => {
    it('sets tenant context as first query', async () => {
      const pool = makePool([ok([]), ok([]), ok([subRow])]);
      const svc = new TrialService(pool);
      await svc.convertTrialToPaid('org-1', 'plan-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0]?.[0]).toContain('set_config');
    });

    it('marks trials as converted', async () => {
      const pool = makePool([ok([]), ok([]), ok([subRow])]);
      const svc = new TrialService(pool);
      await svc.convertTrialToPaid('org-1', 'plan-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1]?.[0]).toContain('is_converted = true');
    });

    it('returns active subscription after conversion', async () => {
      const pool = makePool([ok([]), ok([]), ok([subRow])]);
      const svc = new TrialService(pool);
      const sub = await svc.convertTrialToPaid('org-1', 'plan-1');
      expect(sub.status).toBe('active');
      expect(sub.organizationId).toBe('org-1');
    });

    it('throws when no active trial found', async () => {
      const pool = makePool([ok([]), ok([]), ok([])]);
      const svc = new TrialService(pool);
      await expect(svc.convertTrialToPaid('org-1', 'plan-1')).rejects.toThrow(
        'No active trial found to convert',
      );
    });

    it('updates subscription to active status', async () => {
      const pool = makePool([ok([]), ok([]), ok([subRow])]);
      const svc = new TrialService(pool);
      await svc.convertTrialToPaid('org-1', 'plan-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[2]?.[0]).toContain("status = 'active'");
    });
  });
});
