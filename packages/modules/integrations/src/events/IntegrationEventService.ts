import type { Pool } from 'pg';
import type {
  EventMapping,
  EventMappingRow,
  EventDelivery,
  EventDeliveryRow,
} from '../types.js';

function rowToMapping(row: EventMappingRow): EventMapping {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectorId: row.connector_id,
    galaxyEventType: row.galaxy_event_type,
    externalEventType: row.external_event_type,
    transformationRules: row.transformation_rules,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function rowToDelivery(row: EventDeliveryRow): EventDelivery {
  return {
    id: row.id,
    mappingId: row.mapping_id,
    organizationId: row.organization_id,
    payload: row.payload,
    status: row.status as EventDelivery['status'],
    attempts: parseInt(row.attempts, 10),
    lastAttemptAt: row.last_attempt_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

export interface CreateEventMappingInput {
  organizationId: string;
  connectorId: string;
  galaxyEventType: string;
  externalEventType: string;
  transformationRules: Record<string, unknown>;
}

export class IntegrationEventService {
  constructor(private readonly pool: Pool) {}

  private async setTenantContext(orgId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);
  }

  async createMapping(input: CreateEventMappingInput): Promise<EventMapping> {
    await this.setTenantContext(input.organizationId);
    const result = await this.pool.query<EventMappingRow>(
      `INSERT INTO integration_event_mappings
        (organization_id, connector_id, galaxy_event_type, external_event_type,
         transformation_rules, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [
        input.organizationId,
        input.connectorId,
        input.galaxyEventType,
        input.externalEventType,
        JSON.stringify(input.transformationRules),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create event mapping');
    return rowToMapping(row);
  }

  async listMappings(orgId: string, connectorId: string): Promise<EventMapping[]> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<EventMappingRow>(
      `SELECT * FROM integration_event_mappings
       WHERE organization_id = $1 AND connector_id = $2
       ORDER BY created_at DESC`,
      [orgId, connectorId],
    );
    return result.rows.map(rowToMapping);
  }

  async recordDelivery(
    orgId: string,
    mappingId: string,
    payload: Record<string, unknown>,
  ): Promise<EventDelivery> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<EventDeliveryRow>(
      `INSERT INTO integration_event_deliveries
        (mapping_id, organization_id, payload, status, attempts)
       VALUES ($1, $2, $3, 'pending', 0)
       RETURNING *`,
      [mappingId, orgId, JSON.stringify(payload)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to record delivery');
    return rowToDelivery(row);
  }

  async markDelivered(orgId: string, deliveryId: string): Promise<EventDelivery> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<EventDeliveryRow>(
      `UPDATE integration_event_deliveries
       SET status = 'delivered', delivered_at = NOW(), attempts = attempts + 1,
           last_attempt_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [deliveryId, orgId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Delivery not found');
    return rowToDelivery(row);
  }

  async markFailed(orgId: string, deliveryId: string): Promise<EventDelivery> {
    await this.setTenantContext(orgId);
    const result = await this.pool.query<EventDeliveryRow>(
      `UPDATE integration_event_deliveries
       SET status = 'failed', attempts = attempts + 1, last_attempt_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [deliveryId, orgId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Delivery not found');
    return rowToDelivery(row);
  }
}
