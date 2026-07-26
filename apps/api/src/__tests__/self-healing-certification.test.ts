/**
 * Self-Healing OS Certification Test Suite
 *
 * Certifies the Self-Healing module lifecycle:
 * 1.  healing_incidents and healing_rules tables exist
 * 2.  Incident detection persists a record
 * 3.  Incident retrieval returns the incident
 * 4.  Incident listing is tenant-scoped
 * 5.  Incident listing filters by level
 * 6.  Incident diagnosis updates status
 * 7.  Incident healing sets status to healed
 * 8.  Healing rule creation persists a record
 * 9.  Rule toggle disables a rule
 * 10. Cross-tenant isolation — org B cannot see org A incidents
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { HealingIncidentService, HealingRuleService } from '@galaxy/self-healing';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const orgId = '00000000-3901-4000-8000-390000000001';
const orgIdB = '00000000-3901-4000-8000-390000000002';

let sharedIncidentId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, tier, status)
     VALUES ($1, 'Self-Heal Test Org A', 'heal-test-a', 'starter', 'active'),
            ($2, 'Self-Heal Test Org B', 'heal-test-b', 'starter', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgIdB],
  );

  const svc = new HealingIncidentService(pool);
  const incident = await svc.detectIncident(
    orgId,
    'system',
    'Shared cert incident',
    'workflow',
    'wf-cert-001',
  );
  sharedIncidentId = incident.id;
});

afterAll(async () => {
  await pool
    .query(`DELETE FROM healing_incidents WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM healing_rules WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool
    .query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [orgId, orgIdB])
    .catch(() => null);
  await pool.end();
});

describe('Self-Healing OS Certification', () => {
  // ── 1. Tables exist ────────────────────────────────────────────────────────
  it('1. healing_incidents and healing_rules tables exist', async () => {
    for (const table of ['healing_incidents', 'healing_rules']) {
      const r = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table],
      );
      expect(Number(r.rows[0]?.count ?? 0), `${table} must have columns`).toBeGreaterThan(0);
    }
  });

  // ── 2. Incident detection ─────────────────────────────────────────────────
  it('2. Incident detection persists a record', async () => {
    const svc = new HealingIncidentService(pool);

    const incident = await svc.detectIncident(
      orgId,
      'process',
      'Approval queue backlog detected',
      'approval_queue',
      'aq-cert-001',
    );

    expect(incident.id).toBeTruthy();
    expect(incident.organizationId).toBe(orgId);
    expect(incident.level).toBe('process');
    expect(incident.description).toBe('Approval queue backlog detected');
    expect(incident.status).toBe('detected');
  });

  // ── 3. Incident retrieval ─────────────────────────────────────────────────
  it('3. Incident retrieval returns the incident', async () => {
    const svc = new HealingIncidentService(pool);

    const incident = await svc.getIncident(orgId, sharedIncidentId);
    expect(incident.id).toBe(sharedIncidentId);
    expect(incident.organizationId).toBe(orgId);
  });

  // ── 4. Incident listing ───────────────────────────────────────────────────
  it('4. Incident listing is tenant-scoped', async () => {
    const svc = new HealingIncidentService(pool);

    const incidents = await svc.listIncidents(orgId);
    expect(Array.isArray(incidents)).toBe(true);
    expect(incidents.length).toBeGreaterThan(0);
    for (const i of incidents) {
      expect(i.organizationId).toBe(orgId);
    }
  });

  // ── 5. Incident listing filters by level ─────────────────────────────────
  it('5. Incident listing filters by level', async () => {
    const svc = new HealingIncidentService(pool);

    const incidents = await svc.listIncidents(orgId, 'system');
    expect(Array.isArray(incidents)).toBe(true);
    for (const i of incidents) {
      expect(i.level).toBe('system');
    }
  });

  // ── 6. Incident diagnosis ─────────────────────────────────────────────────
  it('6. Incident diagnosis updates status', async () => {
    const svc = new HealingIncidentService(pool);

    const diagnosed = await svc.diagnose(
      orgId,
      sharedIncidentId,
      'Root cause: high workflow error rate',
    );
    expect(diagnosed.status).toBe('diagnosing');
    expect(diagnosed.diagnosis).toBe('Root cause: high workflow error rate');
  });

  // ── 7. Incident healing ───────────────────────────────────────────────────
  it('7. Incident healing sets status to healed', async () => {
    const svc = new HealingIncidentService(pool);

    const healed = await svc.heal(orgId, sharedIncidentId, 'Restarted workflow processor');
    expect(healed.status).toBe('healed');
    expect(healed.resolution).toBe('Restarted workflow processor');
    expect(healed.healedAt).toBeTruthy();
  });

  // ── 8. Healing rule creation ──────────────────────────────────────────────
  it('8. Healing rule creation persists a record', async () => {
    const svc = new HealingRuleService(pool);

    const rule = await svc.createRule(
      orgId,
      'process',
      'Auto-restart on backlog',
      { metric: 'queue_depth', threshold: 100 },
      'restart_processor',
      10,
    );

    expect(rule.id).toBeTruthy();
    expect(rule.organizationId).toBe(orgId);
    expect(rule.name).toBe('Auto-restart on backlog');
    expect(rule.enabled).toBe(true);
  });

  // ── 9. Rule toggle ────────────────────────────────────────────────────────
  it('9. Rule toggle disables a rule', async () => {
    const svc = new HealingRuleService(pool);

    const rules = await svc.listRules(orgId);
    const first = rules[0];
    if (!first) return;

    const toggled = await svc.toggleRule(orgId, first.id, false);
    expect(toggled.enabled).toBe(false);
  });

  // ── 10. Cross-tenant isolation ────────────────────────────────────────────
  it('10. Org B cannot see org A incidents', async () => {
    const svc = new HealingIncidentService(pool);

    const incidentsB = await svc.listIncidents(orgIdB);
    const leaked = incidentsB.some((i) => i.organizationId === orgId);
    expect(leaked).toBe(false);
  });
});
