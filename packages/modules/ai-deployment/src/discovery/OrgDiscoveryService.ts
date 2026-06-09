import type { Pool } from 'pg';
import type { OrgDiscoverySession } from '../types.js';

export const DISCOVERY_QUESTIONS: string[] = [
  'What type of organization are you (e.g., startup, enterprise, non-profit, government)?',
  'How many people are in your organization?',
  'What are your primary business processes or workflows?',
  'What communication channels does your team use (e.g., WhatsApp, Slack, email)?',
  'How is your organization structured (flat, hierarchical, matrix)?',
  'What are the top 3 challenges your organization currently faces?',
  'What technology tools does your team currently use?',
];

interface SessionRow {
  id: string;
  organization_id: string;
  current_step: number;
  total_steps: number;
  responses: Record<string, unknown>;
  generated_structure: Record<string, unknown> | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function mapSession(row: SessionRow): OrgDiscoverySession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    currentStep: row.current_step,
    totalSteps: row.total_steps,
    responses: row.responses,
    status: row.status as OrgDiscoverySession['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.generated_structure !== null
      ? { generatedStructure: row.generated_structure }
      : {}),
  };
}

export class OrgDiscoveryService {
  constructor(private readonly pool: Pool) {}

  async startSession(orgId: string): Promise<OrgDiscoverySession> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<SessionRow>(
      `INSERT INTO org_discovery_sessions (organization_id, total_steps)
       VALUES ($1, $2)
       RETURNING *`,
      [orgId, DISCOVERY_QUESTIONS.length],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Failed to create discovery session');
    return mapSession(row);
  }

  async getSession(orgId: string, sessionId: string): Promise<OrgDiscoverySession> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const result = await this.pool.query<SessionRow>(
      'SELECT * FROM org_discovery_sessions WHERE id = $1 AND organization_id = $2',
      [sessionId, orgId],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Discovery session not found');
    return mapSession(row);
  }

  getNextQuestion(session: OrgDiscoverySession): string | null {
    const question = DISCOVERY_QUESTIONS[session.currentStep];
    return question ?? null;
  }

  async answerQuestion(
    orgId: string,
    sessionId: string,
    answer: string,
  ): Promise<OrgDiscoverySession & { nextQuestion?: string; complete: boolean }> {
    await this.pool.query('SELECT set_config($1, $2, true)', ['app.current_tenant', orgId]);

    const session = await this.getSession(orgId, sessionId);
    const stepKey = String(session.currentStep);
    const updatedResponses = { ...session.responses, [stepKey]: answer };
    const nextStep = session.currentStep + 1;
    const isComplete = nextStep >= session.totalSteps;

    if (isComplete) {
      const generatedStructure: Record<string, unknown> = {
        responses: updatedResponses,
        generatedAt: new Date().toISOString(),
        departments: ['Operations', 'Finance', 'HR'],
        roles: ['Admin', 'Manager', 'Member'],
      };

      const result = await this.pool.query<SessionRow>(
        `UPDATE org_discovery_sessions
         SET responses = $3, current_step = $4, status = 'complete',
             generated_structure = $5, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [sessionId, orgId, JSON.stringify(updatedResponses), nextStep, JSON.stringify(generatedStructure)],
      );

      const row = result.rows[0];
      if (row === undefined) throw new Error('Discovery session not found');
      return { ...mapSession(row), complete: true };
    }

    const result = await this.pool.query<SessionRow>(
      `UPDATE org_discovery_sessions
       SET responses = $3, current_step = $4, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [sessionId, orgId, JSON.stringify(updatedResponses), nextStep],
    );

    const row = result.rows[0];
    if (row === undefined) throw new Error('Discovery session not found');
    const updatedSession = mapSession(row);
    const nextQuestion = this.getNextQuestion(updatedSession);

    return {
      ...updatedSession,
      complete: false,
      ...(nextQuestion !== null ? { nextQuestion } : {}),
    };
  }
}
