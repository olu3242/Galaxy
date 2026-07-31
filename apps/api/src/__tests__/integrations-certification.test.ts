/**
 * Integrations OS Certification Test Suite
 *
 * Certifies the Integrations module lifecycle:
 * 1.  integration_connectors and integration_sync_logs tables exist
 * 2.  Connector registration creates an inactive connector
 * 3.  Connector enable transitions status to active
 * 4.  Connector disable transitions status to inactive
 * 5.  Sync trigger creates a sync log entry
 * 6.  Sync completion updates the log record
 * 7.  Sync log listing is scoped to connector
 * 8.  Event mapping creation and listing
 * 9.  Event delivery lifecycle — record, deliver, fail
 * 10. Cross-tenant isolation — org B cannot see org A connectors
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  IntegrationConnectorService,
  IntegrationSyncService,
  IntegrationEventService,
} from '@galaxy/integrations';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-2501-4000-8000-250000000001';
const orgIdB = '00000000-2501-4000-8000-250000000002';

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Integrations Test Org A', 'integrations-test-a', 'starter', 'active'),
            ($2, 'Integrations Test Org B', 'integrations-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM integration_event_deliveries WHERE organization_id IN ($1, $2)`, [
      orgId,
      orgIdB,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM integration_event_mappings WHERE organization_id IN ($1, $2)`, [
      orgId,
      orgIdB,
    ])
    .catch(() => null);
  await pool
    .query(`DELETE FROM integration_sync_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM integration_connectors WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Integrations OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. integration_connectors and integration_sync_logs tables exist', async () => {
    for (const table of ['integration_connectors', 'integration_sync_logs']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Connector registration ─────────────────────────────────────────────
  it('2. Connector registration creates an inactive connector', async () => {
    const svc = new IntegrationConnectorService(pool);

    const connector = await svc.registerConnector({
      organizationId: orgId,
      name: 'Slack Webhook',
      connectorType: 'webhook',
      config: { url: 'https://hooks.slack.com/services/T000/B000/xxxx', method: 'POST' },
      credentials: { signingSecret: 'test-secret' },
    });

    expect(connector.id).toBeTruthy();
    expect(connector.organizationId).toBe(orgId);
    expect(connector.status).toBe('inactive');
    expect(connector.connectorType).toBe('webhook');
  });

  // ── 3. Connector enable ───────────────────────────────────────────────────
  it('3. Connector enable transitions status to active', async () => {
    const svc = new IntegrationConnectorService(pool);

    const connector = await svc.registerConnector({
      organizationId: orgId,
      name: 'CRM API Connector',
      connectorType: 'api',
      config: { baseUrl: 'https://api.crm.example.com', version: 'v2' },
      credentials: { apiKey: 'crm-api-key-test' },
    });

    const enabled = await svc.enableConnector(orgId, connector.id);
    expect(enabled.status).toBe('active');
  });

  // ── 4. Connector disable ──────────────────────────────────────────────────
  it('4. Connector disable transitions status to inactive', async () => {
    const svc = new IntegrationConnectorService(pool);

    const connector = await svc.registerConnector({
      organizationId: orgId,
      name: 'OAuth2 Identity Provider',
      connectorType: 'oauth2',
      config: {
        authUrl: 'https://auth.example.com/oauth',
        tokenUrl: 'https://auth.example.com/token',
      },
      credentials: { clientId: 'client-id', clientSecret: 'client-secret' },
    });

    await svc.enableConnector(orgId, connector.id);
    const disabled = await svc.disableConnector(orgId, connector.id);
    expect(disabled.status).toBe('inactive');
  });

  // ── 5. Sync trigger ───────────────────────────────────────────────────────
  it('5. Sync trigger creates a sync log entry', async () => {
    const connSvc = new IntegrationConnectorService(pool);
    const syncSvc = new IntegrationSyncService(pool);

    const connector = await connSvc.registerConnector({
      organizationId: orgId,
      name: `Sync Test Connector ${crypto.randomUUID().slice(0, 8)}`,
      connectorType: 'api',
      config: { baseUrl: 'https://api.example.com' },
      credentials: { apiKey: 'test-key' },
    });

    const syncLog = await syncSvc.triggerSync({
      organizationId: orgId,
      connectorId: connector.id,
      direction: 'inbound',
    });

    expect(syncLog.id).toBeTruthy();
    expect(syncLog.organizationId).toBe(orgId);
    expect(syncLog.connectorId).toBe(connector.id);
    expect(syncLog.direction).toBe('inbound');
    expect(syncLog.completedAt).toBeNull();
  });

  // ── 6. Sync completion ────────────────────────────────────────────────────
  it('6. Sync completion updates the log record', async () => {
    const connSvc = new IntegrationConnectorService(pool);
    const syncSvc = new IntegrationSyncService(pool);

    const connector = await connSvc.registerConnector({
      organizationId: orgId,
      name: `Complete Sync Connector ${crypto.randomUUID().slice(0, 8)}`,
      connectorType: 'webhook',
      config: { url: 'https://hooks.example.com/webhook' },
      credentials: {},
    });

    const syncLog = await syncSvc.triggerSync({
      organizationId: orgId,
      connectorId: connector.id,
      direction: 'outbound',
    });

    const completed = await syncSvc.completeSyncLog(orgId, syncLog.id, 42, 0);
    expect(completed.recordsSynced).toBe(42);
    expect(completed.errorCount).toBe(0);
    expect(completed.completedAt).toBeTruthy();
  });

  // ── 7. Sync log listing ───────────────────────────────────────────────────
  it('7. Sync log listing is scoped to connector', async () => {
    const connSvc = new IntegrationConnectorService(pool);
    const syncSvc = new IntegrationSyncService(pool);

    const connector = await connSvc.registerConnector({
      organizationId: orgId,
      name: `Log List Connector ${crypto.randomUUID().slice(0, 8)}`,
      connectorType: 'api',
      config: {},
      credentials: {},
    });

    await syncSvc.triggerSync({
      organizationId: orgId,
      connectorId: connector.id,
      direction: 'bidirectional',
    });
    await syncSvc.triggerSync({
      organizationId: orgId,
      connectorId: connector.id,
      direction: 'inbound',
    });

    const logs = await syncSvc.listSyncLogs(orgId, connector.id);
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const log of logs) {
      expect(log.connectorId).toBe(connector.id);
    }
  });

  // ── 8. Event mapping ──────────────────────────────────────────────────────
  it('8. Event mapping creation and listing work', async () => {
    const connSvc = new IntegrationConnectorService(pool);
    const eventSvc = new IntegrationEventService(pool);

    const connector = await connSvc.registerConnector({
      organizationId: orgId,
      name: `Event Mapping Connector ${crypto.randomUUID().slice(0, 8)}`,
      connectorType: 'webhook',
      config: { url: 'https://hooks.example.com/events' },
      credentials: {},
    });

    const mapping = await eventSvc.createMapping({
      organizationId: orgId,
      connectorId: connector.id,
      galaxyEventType: 'workflow.completed',
      externalEventType: 'workflow_done',
      transformationRules: { renameField: { workflowId: 'workflow_uuid' } },
    });

    expect(mapping.id).toBeTruthy();
    expect(mapping.organizationId).toBe(orgId);
    expect(mapping.galaxyEventType).toBe('workflow.completed');
    expect(mapping.isActive).toBe(true);

    const mappings = await eventSvc.listMappings(orgId, connector.id);
    expect(Array.isArray(mappings)).toBe(true);
    expect(mappings.some((m) => m.id === mapping.id)).toBe(true);
  });

  // ── 9. Event delivery lifecycle ───────────────────────────────────────────
  it('9. Event delivery lifecycle — record, deliver, fail', async () => {
    const connSvc = new IntegrationConnectorService(pool);
    const eventSvc = new IntegrationEventService(pool);

    const connector = await connSvc.registerConnector({
      organizationId: orgId,
      name: `Delivery Connector ${crypto.randomUUID().slice(0, 8)}`,
      connectorType: 'webhook',
      config: { url: 'https://hooks.example.com/deliver' },
      credentials: {},
    });

    const mapping = await eventSvc.createMapping({
      organizationId: orgId,
      connectorId: connector.id,
      galaxyEventType: 'approval.completed',
      externalEventType: 'approval_done',
      transformationRules: {},
    });

    const delivery = await eventSvc.recordDelivery(orgId, mapping.id, {
      approvalId: crypto.randomUUID(),
      status: 'approved',
    });
    expect(delivery.id).toBeTruthy();
    expect(delivery.status).toBe('pending');

    const delivered = await eventSvc.markDelivered(orgId, delivery.id);
    expect(delivered.status).toBe('delivered');

    // Test fail path separately
    const failDelivery = await eventSvc.recordDelivery(orgId, mapping.id, {
      approvalId: crypto.randomUUID(),
    });
    const failed = await eventSvc.markFailed(orgId, failDelivery.id);
    expect(failed.status).toBe('failed');
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A connectors', async () => {
    const svc = new IntegrationConnectorService(pool);

    await svc.registerConnector({
      organizationId: orgId,
      name: 'Isolation Test Connector',
      connectorType: 'api',
      config: { secret: 'org-a-data' },
      credentials: {},
    });

    const connectorsB = await svc.listConnectors(orgIdB);
    const leaked = connectorsB.some((c) => c.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
