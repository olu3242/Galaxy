import type { Pool } from 'pg';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface PlatformHealthSnapshot {
  id: string;
  status: HealthStatus;
  components: Record<string, unknown>;
  snapshotAt: string;
}

interface HealthSnapshotRow {
  id: string;
  status: string;
  components: Record<string, unknown>;
  snapshot_at: string;
}

export class PlatformHealthService {
  constructor(private readonly pool: Pool) {}

  async recordSnapshot(input: {
    status: HealthStatus;
    components: Record<string, unknown>;
  }): Promise<PlatformHealthSnapshot> {
    const result = await this.pool.query<HealthSnapshotRow>(
      `INSERT INTO platform_health_snapshots (status, components)
       VALUES ($1, $2)
       RETURNING *`,
      [input.status, JSON.stringify(input.components)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record health snapshot');
    return this.mapSnapshot(row);
  }

  async getLatest(): Promise<PlatformHealthSnapshot | null> {
    const result = await this.pool.query<HealthSnapshotRow>(
      `SELECT * FROM platform_health_snapshots ORDER BY snapshot_at DESC LIMIT 1`,
    );
    const row = result.rows[0];
    return row ? this.mapSnapshot(row) : null;
  }

  async listSnapshots(limit = 10): Promise<PlatformHealthSnapshot[]> {
    const result = await this.pool.query<HealthSnapshotRow>(
      `SELECT * FROM platform_health_snapshots ORDER BY snapshot_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((r) => this.mapSnapshot(r));
  }

  async checkHealth(): Promise<PlatformHealthSnapshot> {
    // Basic health check: can we query the database?
    const dbResult = await this.pool.query<{ ok: boolean }>(`SELECT true AS ok`);
    const dbOk = dbResult.rows[0]?.ok ?? false;

    const status: HealthStatus = dbOk ? 'healthy' : 'unhealthy';
    const components = {
      database: { status: dbOk ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    };

    return this.recordSnapshot({ status, components });
  }

  private mapSnapshot(row: HealthSnapshotRow): PlatformHealthSnapshot {
    return {
      id: row.id,
      status: row.status as HealthStatus,
      components: row.components,
      snapshotAt: row.snapshot_at,
    };
  }
}
