import type { Pool } from 'pg';
import type { Contribution, ContributionRow } from './types.js';

function rowToContribution(row: ContributionRow): Contribution {
  return {
    id: row.id,
    organizationId: row.organization_id,
    metricKey: row.metric_key,
    metricValue: parseFloat(row.metric_value),
    period: row.period,
    anonymizationNoise: parseFloat(row.anonymization_noise),
    createdAt: row.created_at,
  };
}

function addLaplaceNoise(value: number, sensitivity: number, epsilon: number): number {
  // Laplace mechanism for differential privacy
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + noise;
}

export interface ContributeInput {
  organizationId: string;
  metricKey: string;
  metricValue: number;
  period: string;
}

export class ContributionService {
  constructor(private readonly pool: Pool) {}

  async contribute(input: ContributeInput): Promise<Contribution> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      input.organizationId,
    ]);
    const noisyValue = addLaplaceNoise(input.metricValue, 1.0, 1.0);
    const noise = noisyValue - input.metricValue;
    const result = await this.pool.query<ContributionRow>(
      `INSERT INTO intelligence_contributions
         (organization_id, metric_key, metric_value, period, anonymization_noise)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, metric_key, period) DO UPDATE
         SET metric_value = $3, anonymization_noise = $5
       RETURNING *`,
      [input.organizationId, input.metricKey, noisyValue, input.period, noise],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to store contribution');
    return rowToContribution(row);
  }

  async withdraw(organizationId: string, metricKey: string, period: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
    await this.pool.query(
      'DELETE FROM intelligence_contributions WHERE organization_id = $1 AND metric_key = $2 AND period = $3',
      [organizationId, metricKey, period],
    );
  }
}
