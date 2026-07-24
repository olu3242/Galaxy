import type { Pool, PoolClient } from 'pg';
import type {
  AofCertification,
  AofCertificationStatus,
  CertificationChecklist,
  RollbackPlan,
} from '@galaxy/types';
import type { UUID } from '@galaxy/types';

interface CertificationRow {
  id: string;
  organization_id: string;
  optimization_id: string;
  status: string;
  checklist: CertificationChecklist;
  rollback_plan: RollbackPlan;
  reviewer_id: string | null;
  decided_at: string | null;
  created_at: string;
}

export class AutonomousCertificationService {
  constructor(private readonly pool: Pool) {}

  async submit(
    client: PoolClient,
    opts: {
      organizationId: UUID;
      optimizationId: UUID;
      checklist: CertificationChecklist;
      rollbackPlan: RollbackPlan;
    },
  ): Promise<AofCertification> {
    const result = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO aof_certifications
         (organization_id, optimization_id, checklist, rollback_plan)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [
        opts.organizationId,
        opts.optimizationId,
        JSON.stringify(opts.checklist),
        JSON.stringify(opts.rollbackPlan),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('aof_certifications INSERT returned no row');

    return {
      id: row.id,
      organizationId: opts.organizationId,
      optimizationId: opts.optimizationId,
      status: 'Proposed',
      checklist: opts.checklist,
      rollbackPlan: opts.rollbackPlan,
      reviewerId: null,
      decidedAt: null,
      createdAt: row.created_at,
    };
  }

  async decide(
    client: PoolClient,
    certificationId: UUID,
    decision: 'Certified' | 'Rejected',
    reviewerId: UUID,
  ): Promise<void> {
    await client.query(
      `UPDATE aof_certifications
       SET status = $1, reviewer_id = $2, decided_at = NOW()
       WHERE id = $3`,
      [decision, reviewerId, certificationId],
    );
  }

  async get(client: PoolClient, certificationId: UUID): Promise<AofCertification | null> {
    const result = await client.query<CertificationRow>(
      `SELECT * FROM aof_certifications WHERE id = $1`,
      [certificationId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapRow(row);
  }

  async listPending(client: PoolClient, organizationId: UUID): Promise<AofCertification[]> {
    const result = await client.query<CertificationRow>(
      `SELECT * FROM aof_certifications
       WHERE organization_id = $1
         AND status IN ('Proposed', 'Under Review')
       ORDER BY created_at ASC`,
      [organizationId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  isCertificationReady(checklist: CertificationChecklist): boolean {
    return Object.values(checklist).every(Boolean);
  }

  private mapRow(row: CertificationRow): AofCertification {
    return {
      id: row.id,
      organizationId: row.organization_id,
      optimizationId: row.optimization_id,
      status: row.status as AofCertificationStatus,
      checklist: row.checklist,
      rollbackPlan: row.rollback_plan,
      reviewerId: row.reviewer_id,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    };
  }
}
