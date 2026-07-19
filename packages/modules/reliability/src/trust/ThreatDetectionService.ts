import type { Pool } from 'pg';
import type { ThreatEvent, ThreatType, ThreatSeverity, ThreatStatus } from './types.js';

interface ThreatRow {
  id: string;
  organization_id: string;
  threat_type: string;
  severity: string;
  status: string;
  source_id: string;
  source_type: string;
  content: string;
  indicators: Record<string, unknown>;
  detected_at: Date;
  resolved_at: Date | null;
}

function rowToThreat(row: ThreatRow): ThreatEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    threatType: row.threat_type as ThreatType,
    severity: row.severity as ThreatSeverity,
    status: row.status as ThreatStatus,
    sourceId: row.source_id,
    sourceType: row.source_type,
    content: row.content,
    indicators: row.indicators,
    detectedAt: row.detected_at,
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  };
}

const THREAT_PATTERNS: Record<ThreatType, RegExp[]> = {
  spam: [/buy now/i, /click here/i, /limited offer/i],
  abuse: [/harassment/i, /threat/i],
  bot: [/^\s*$/, /(.)\1{10,}/],
  impersonation: [/i am the ceo/i, /i am your boss/i],
  phishing: [/verify your account/i, /your password/i, /login here/i],
  prompt_injection: [/ignore previous instructions/i, /disregard your prompt/i, /system:/i],
  social_engineering: [/urgent/i, /act now/i, /secret/i],
  policy_violation: [/bypass/i, /override policy/i],
};

export class ThreatDetectionService {
  constructor(private readonly pool: Pool) {}

  detect(content: string): ThreatType | null {
    for (const [type, patterns] of Object.entries(THREAT_PATTERNS)) {
      if (patterns.some((p) => p.test(content))) {
        return type as ThreatType;
      }
    }
    return null;
  }

  async recordThreat(
    orgId: string,
    threatType: ThreatType,
    severity: ThreatSeverity,
    sourceId: string,
    sourceType: string,
    content: string,
    indicators?: Record<string, unknown>,
  ): Promise<ThreatEvent> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const result = await this.pool.query<ThreatRow>(
      `INSERT INTO threat_events (organization_id, threat_type, severity, source_id, source_type, content, indicators)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        orgId,
        threatType,
        severity,
        sourceId,
        sourceType,
        content,
        JSON.stringify(indicators ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record threat');
    return rowToThreat(row);
  }

  async listThreats(orgId: string, threatType?: ThreatType, limit = 100): Promise<ThreatEvent[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const params: unknown[] = [orgId];
    const cond =
      threatType !== undefined ? ` AND threat_type = $${String(params.push(threatType))}` : '';
    params.push(limit);
    const result = await this.pool.query<ThreatRow>(
      `SELECT * FROM threat_events WHERE organization_id = $1${cond} ORDER BY detected_at DESC LIMIT $${String(params.length)}`,
      params,
    );
    return result.rows.map(rowToThreat);
  }

  async updateStatus(orgId: string, threatId: string, status: ThreatStatus): Promise<ThreatEvent> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
    const resolved = status === 'confirmed' || status === 'dismissed' || status === 'blocked';
    const result = await this.pool.query<ThreatRow>(
      `UPDATE threat_events SET status = $3 ${resolved ? ', resolved_at = NOW()' : ''}
       WHERE organization_id = $1 AND id = $2 RETURNING *`,
      [orgId, threatId, status],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Threat event not found');
    return rowToThreat(row);
  }
}
