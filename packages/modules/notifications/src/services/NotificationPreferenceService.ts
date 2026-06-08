import type { Pool } from 'pg';
import type { NotificationPreferenceRow } from '../types.js';

export interface NotificationPreference {
  id: string;
  organizationId: string;
  memberId: string;
  channel: string;
  notificationType: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPreferenceInput {
  organizationId: string;
  memberId: string;
  channel: string;
  notificationType: string;
  isEnabled: boolean;
}

function rowToPreference(row: NotificationPreferenceRow): NotificationPreference {
  return {
    id: row.id,
    organizationId: row.organization_id,
    memberId: row.member_id,
    channel: row.channel,
    notificationType: row.notification_type,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotificationPreferenceService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async get(
    organizationId: string,
    memberId: string,
    channel: string,
    notificationType: string,
  ): Promise<NotificationPreference | null> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationPreferenceRow>(
      `SELECT * FROM notification_preferences
       WHERE organization_id = $1 AND member_id = $2 AND channel = $3 AND notification_type = $4`,
      [organizationId, memberId, channel, notificationType],
    );
    const row = result.rows[0];
    return row ? rowToPreference(row) : null;
  }

  async upsert(input: UpsertPreferenceInput): Promise<NotificationPreference> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<NotificationPreferenceRow>(
      `INSERT INTO notification_preferences
         (organization_id, member_id, channel, notification_type, is_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, member_id, channel, notification_type)
       DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = NOW()
       RETURNING *`,
      [
        input.organizationId,
        input.memberId,
        input.channel,
        input.notificationType,
        input.isEnabled,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('INSERT RETURNING returned no row');
    return rowToPreference(row);
  }

  async listForMember(organizationId: string, memberId: string): Promise<NotificationPreference[]> {
    await this.setTenantContext(organizationId);
    const result = await this.pool.query<NotificationPreferenceRow>(
      `SELECT * FROM notification_preferences WHERE organization_id = $1 AND member_id = $2`,
      [organizationId, memberId],
    );
    return result.rows.map(rowToPreference);
  }
}
