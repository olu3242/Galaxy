import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { HealthScoreService } from '../services/HealthScoreService.js';

const organizationId = '00000000-0000-0000-0000-000000000001';

function makeHealthScoreRow(score: number) {
  return {
    id: 'score-1',
    organization_id: organizationId,
    category: 'organization',
    entity_id: null,
    score: String(score),
    components: {},
    computed_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('HealthScoreService', () => {
  describe('computeOrganizationHealth', () => {
    it('sets tenant context before querying', async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [makeHealthScoreRow(50)], rowCount: 1 });

      const pool = { query } as unknown as Pool;
      const service = new HealthScoreService(pool);

      await service.computeOrganizationHealth(organizationId);

      const firstCall = query.mock.calls[0];
      expect(firstCall?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(firstCall?.[1]).toEqual(['app.current_tenant', organizationId]);
    });

    it('returns a health score with numeric score', async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '20' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [makeHealthScoreRow(65)], rowCount: 1 });

      const pool = { query } as unknown as Pool;
      const service = new HealthScoreService(pool);

      const result = await service.computeOrganizationHealth(organizationId);

      expect(typeof result.score).toBe('number');
      expect(result.organizationId).toBe(organizationId);
      expect(result.category).toBe('organization');
    });
  });

  describe('computeMemberEngagement', () => {
    it('sets tenant context before computing', async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '10', active: '8' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [makeHealthScoreRow(80)],
          rowCount: 1,
        });

      const pool = { query } as unknown as Pool;
      const service = new HealthScoreService(pool);

      await service.computeMemberEngagement(organizationId);

      const firstCall = query.mock.calls[0];
      expect(firstCall?.[0]).toBe('SELECT set_config($1, $2, true)');
      expect(firstCall?.[1]).toEqual(['app.current_tenant', organizationId]);
    });
  });

  describe('computeWorkflowEffectiveness', () => {
    it('returns score based on completion rate', async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ total: '10', completed: '8' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [makeHealthScoreRow(80)],
          rowCount: 1,
        });

      const pool = { query } as unknown as Pool;
      const service = new HealthScoreService(pool);

      const result = await service.computeWorkflowEffectiveness(organizationId);

      expect(result.category).toBe('workflow');
    });
  });
});
