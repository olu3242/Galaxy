import { describe, it, expect, vi } from 'vitest';
import { ReadinessScoringService } from '../lifecycle/ReadinessScoringService.js';
import type { Pool, QueryResult } from 'pg';

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

describe('ReadinessScoringService', () => {
  describe('computeScore', () => {
    it('sets tenant context before query', async () => {
      const pool = makePool([
        ok([]),
        ok([
          {
            member_count: '5',
            workflow_count: '3',
            active_workflows: '2',
            last_activity_days: '0.5',
          },
        ]),
      ]);
      const svc = new ReadinessScoringService(pool);
      await svc.computeScore('org-1');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[0][0]).toContain('set_config');
    });

    it('returns org-1 and computed breakdown', async () => {
      const pool = makePool([
        ok([]),
        ok([
          {
            member_count: '5',
            workflow_count: '3',
            active_workflows: '2',
            last_activity_days: '0.5',
          },
        ]),
      ]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.computeScore('org-1');
      expect(result.organizationId).toBe('org-1');
      expect(result.breakdown.memberScore).toBe(25); // 5 * 5 = 25
      expect(result.breakdown.workflowScore).toBe(13); // 3*3 + 2*2 = 13
      expect(result.breakdown.activityScore).toBe(25); // < 1 day
      expect(result.breakdown.configurationScore).toBe(25);
      expect(result.score).toBe(88);
      expect(result.grade).toBe('B');
    });

    it('assigns grade A for score >= 90', async () => {
      const pool = makePool([
        ok([]),
        ok([
          {
            member_count: '5',
            workflow_count: '10',
            active_workflows: '5',
            last_activity_days: '0.1',
          },
        ]),
      ]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.computeScore('org-1');
      expect(result.grade).toBe('A');
    });

    it('assigns grade F for low score', async () => {
      const pool = makePool([
        ok([]),
        ok([
          {
            member_count: '0',
            workflow_count: '0',
            active_workflows: '0',
            last_activity_days: '999',
          },
        ]),
      ]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.computeScore('org-1');
      expect(result.grade).toBe('F');
      expect(result.score).toBe(0);
    });

    it('handles missing row with zero values', async () => {
      const pool = makePool([ok([]), ok([])]);
      const svc = new ReadinessScoringService(pool);
      const result = await svc.computeScore('org-1');
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
    });

    it('passes orgId as query parameter', async () => {
      const pool = makePool([
        ok([]),
        ok([
          {
            member_count: '1',
            workflow_count: '1',
            active_workflows: '1',
            last_activity_days: '5',
          },
        ]),
      ]);
      const svc = new ReadinessScoringService(pool);
      await svc.computeScore('org-99');
      const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
      expect(calls[1][1]).toContain('org-99');
    });
  });
});
