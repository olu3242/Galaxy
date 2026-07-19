import type { Pool } from 'pg';

export interface UsageEvent {
  id: string;
  organizationId: string;
  resourceType: string;
  quantity: number;
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  resourceType: string;
  totalQuantity: number;
  createdAt: string;
}

interface UsageEventRow {
  id: string;
  organization_id: string;
  resource_type: string;
  quantity: string;
  metadata: Record<string, unknown>;
  recorded_at: string;
}

interface UsageRecordRow {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  resource_type: string;
  total_quantity: string;
  created_at: string;
}

export class UsageMeteringService {
  constructor(private readonly pool: Pool) {}

  async recordEvent(input: {
    organizationId: string;
    resourceType: string;
    quantity: number;
    metadata?: Record<string, unknown>;
  }): Promise<UsageEvent> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const result = await this.pool.query<UsageEventRow>(
      `INSERT INTO usage_events (organization_id, resource_type, quantity, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.organizationId,
        input.resourceType,
        input.quantity,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record usage event');
    return this.mapEvent(row);
  }

  async queryEvents(input: {
    organizationId: string;
    resourceType?: string;
    since?: Date;
    limit?: number;
  }): Promise<UsageEvent[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const conditions = ['organization_id = $1'];
    const params: unknown[] = [input.organizationId];
    let idx = 2;

    if (input.resourceType !== undefined) {
      conditions.push(`resource_type = $${String(idx++)}`);
      params.push(input.resourceType);
    }
    if (input.since !== undefined) {
      conditions.push(`recorded_at >= $${String(idx++)}`);
      params.push(input.since.toISOString());
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = input.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (input.limit !== undefined) params.push(input.limit);

    const result = await this.pool.query<UsageEventRow>(
      `SELECT * FROM usage_events ${where} ORDER BY recorded_at DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapEvent(r));
  }

  async getUsageRecords(
    organizationId: string,
    opts?: { resourceType?: string; limit?: number },
  ): Promise<UsageRecord[]> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    const params: unknown[] = [organizationId];
    let idx = 2;
    const extraWhere =
      opts?.resourceType !== undefined ? ` AND resource_type = $${String(idx++)}` : '';
    if (opts?.resourceType !== undefined) params.push(opts.resourceType);
    const limit = opts?.limit !== undefined ? ` LIMIT $${String(idx++)}` : '';
    if (opts?.limit !== undefined) params.push(opts.limit);

    const result = await this.pool.query<UsageRecordRow>(
      `SELECT * FROM usage_records WHERE organization_id = $1${extraWhere} ORDER BY period_start DESC${limit}`,
      params,
    );
    return result.rows.map((r) => this.mapRecord(r));
  }

  private mapEvent(row: UsageEventRow): UsageEvent {
    return {
      id: row.id,
      organizationId: row.organization_id,
      resourceType: row.resource_type,
      quantity: parseFloat(row.quantity),
      metadata: row.metadata,
      recordedAt: row.recorded_at,
    };
  }

  private mapRecord(row: UsageRecordRow): UsageRecord {
    return {
      id: row.id,
      organizationId: row.organization_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      resourceType: row.resource_type,
      totalQuantity: parseFloat(row.total_quantity),
      createdAt: row.created_at,
    };
  }
}
