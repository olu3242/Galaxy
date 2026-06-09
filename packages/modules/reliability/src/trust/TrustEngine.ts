import type { Pool } from 'pg';
import type { TrustScore } from './types.js';
import { ThreatDetectionService } from './ThreatDetectionService.js';

interface TrustRow {
  id: string;
  organization_id: string;
  entity_id: string;
  entity_type: string;
  score: number;
  flags: string[];
  calculated_at: Date;
}

export class TrustEngine {
  private readonly threatSvc: ThreatDetectionService;

  constructor(private readonly pool: Pool) {
    this.threatSvc = new ThreatDetectionService(pool);
  }

  async computeTrustScore(
    orgId: string,
    entityId: string,
    entityType: string,
    recentContent?: string,
  ): Promise<TrustScore> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const flags: string[] = [];
    let score = 1.0;

    if (recentContent !== undefined) {
      const detected = this.threatSvc.detect(recentContent);
      if (detected !== null) {
        flags.push(detected);
        score -= 0.3;
      }
    }

    const threatCount = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM threat_events WHERE organization_id = $1 AND source_id = $2 AND status = 'confirmed'`,
      [orgId, entityId],
    );
    const confirmed = parseInt(threatCount.rows[0]?.count ?? '0', 10);
    score = Math.max(0, score - confirmed * 0.1);

    const result = await this.pool.query<TrustRow>(
      `INSERT INTO trust_scores (organization_id, entity_id, entity_type, score, flags)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, entity_id, entity_type)
       DO UPDATE SET score = EXCLUDED.score, flags = EXCLUDED.flags, calculated_at = NOW()
       RETURNING *`,
      [orgId, entityId, entityType, score, JSON.stringify(flags)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to compute trust score');
    return {
      id: row.id,
      organizationId: row.organization_id,
      entityId: row.entity_id,
      entityType: row.entity_type,
      score: row.score,
      flags: row.flags,
      calculatedAt: row.calculated_at,
    };
  }
}
