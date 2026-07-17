import { describe, it, expect, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { TrialService } from '../TrialService.js';

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

const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

const trialSubRow = {
  id: 'sub-1',
  organization_id: 'org-1',
  plan_id: 'plan-1',
  status: 'trialing',
  trial_ends_at: trialEndsAt,
  current_period_start: '2024-01-01T00:00:00Z',
  current_period_end: '2024-02-01T00:00:00Z',
  cancelled_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const eventRow = {
  id: 'evt-1',
  organization_id: 'org-1',
  subscription_id: 'sub-1',
  event_type: 'created',
  metadata: {},
  occurred_at: '2024-01-01T00:00:00Z',
};

describe('TrialService', () => {
  describe('startTrial', () => {
    it('creates a trialing subscription with trialEndsAt', async () => {
      // set_config, INSERT subscription, INSERT event
      const pool = makePool([ok([]), ok([trialSubRow]), ok([eventRow])]);
      const svc = new TrialService(pool);
      const result = await svc.startTrial({ organizationId: 'org-1', planId: 'plan-1' });
      expect(result.status).toBe('trialing');
      expect(result.trialEndsAt).toBeTruthy();
    });
  });

  describe('getTrialStatus', () => {
    it('returns onTrial=true with daysRemaining for trialing subscription', async () => {
      // set_config, SELECT subscription
      const pool = makePool([ok([]), ok([trialSubRow])]);
      const svc = new TrialService(pool);
      const result = await svc.getTrialStatus('org-1');
      expect(result.onTrial).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.subscription?.id).toBe('sub-1');
    });

    it('returns onTrial=false when subscription is active', async () => {
      const activeRow = { ...trialSubRow, status: 'active', trial_ends_at: null };
      const pool = makePool([ok([]), ok([activeRow])]);
      const svc = new TrialService(pool);
      const result = await svc.getTrialStatus('org-1');
      expect(result.onTrial).toBe(false);
      expect(result.daysRemaining).toBeNull();
    });

    it('returns onTrial=false when no subscription', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TrialService(pool);
      const result = await svc.getTrialStatus('org-1');
      expect(result.onTrial).toBe(false);
      expect(result.subscription).toBeNull();
    });
  });

  describe('convertTrial', () => {
    it('converts trialing subscription to active', async () => {
      const activeRow = { ...trialSubRow, status: 'active' };
      // getSubscription: set_config + SELECT; updateStatus: set_config + UPDATE + INSERT event
      const pool = makePool([ok([]), ok([trialSubRow]), ok([]), ok([activeRow]), ok([eventRow])]);
      const svc = new TrialService(pool);
      const result = await svc.convertTrial('org-1');
      expect(result?.status).toBe('active');
    });

    it('returns null when subscription is not trialing', async () => {
      const activeRow = { ...trialSubRow, status: 'active' };
      const pool = makePool([ok([]), ok([activeRow])]);
      const svc = new TrialService(pool);
      const result = await svc.convertTrial('org-1');
      expect(result).toBeNull();
    });

    it('returns null when no subscription found', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new TrialService(pool);
      const result = await svc.convertTrial('org-1');
      expect(result).toBeNull();
    });
  });
});
