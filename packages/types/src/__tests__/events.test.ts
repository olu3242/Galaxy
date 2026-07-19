/**
 * @galaxy/types — EventTypes constants · GalaxyEvent structural tests
 */
import { describe, it, expect } from 'vitest';
import { EventTypes } from '../events.js';

// ─── EventTypes constant shapes ───────────────────────────────────────────────

describe('EventTypes — naming convention', () => {
  it('every value follows dot-separated lowercase naming', () => {
    for (const [key, value] of Object.entries(EventTypes)) {
      expect(value, `EventTypes.${key}`).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)*$/);
    }
  });

  it('every value is a non-empty string', () => {
    for (const [key, value] of Object.entries(EventTypes)) {
      expect(typeof value, `EventTypes.${key}`).toBe('string');
      expect(value.length, `EventTypes.${key}`).toBeGreaterThan(0);
    }
  });

  it('has no duplicate values', () => {
    const values = Object.values(EventTypes);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ─── Key event type spot-checks ───────────────────────────────────────────────

describe('EventTypes — workflow domain', () => {
  it('WORKFLOW_SUBMITTED is "workflow.submitted"', () => {
    expect(EventTypes.WORKFLOW_SUBMITTED).toBe('workflow.submitted');
  });
  it('WORKFLOW_COMPLETED is "workflow.completed"', () => {
    expect(EventTypes.WORKFLOW_COMPLETED).toBe('workflow.completed');
  });
  it('WORKFLOW_FAILED is "workflow.failed"', () => {
    expect(EventTypes.WORKFLOW_FAILED).toBe('workflow.failed');
  });
  it('WORKFLOW_SLA_BREACHED is "workflow.sla.breached"', () => {
    expect(EventTypes.WORKFLOW_SLA_BREACHED).toBe('workflow.sla.breached');
  });
});

describe('EventTypes — loop domain', () => {
  it('LOOP_STARTED is "loop.started"', () => {
    expect(EventTypes.LOOP_STARTED).toBe('loop.started');
  });
  it('LOOP_VERIFIED is "loop.verified"', () => {
    expect(EventTypes.LOOP_VERIFIED).toBe('loop.verified');
  });
  it('LOOP_COMPLETED is "loop.completed"', () => {
    expect(EventTypes.LOOP_COMPLETED).toBe('loop.completed');
  });
  it('LOOP_FAILED is "loop.failed"', () => {
    expect(EventTypes.LOOP_FAILED).toBe('loop.failed');
  });
});

describe('EventTypes — agent domain', () => {
  it('AGENT_ACTION_STARTED is "agent.action.started"', () => {
    expect(EventTypes.AGENT_ACTION_STARTED).toBe('agent.action.started');
  });
  it('AGENT_ACTION_COMPLETED is "agent.action.completed"', () => {
    expect(EventTypes.AGENT_ACTION_COMPLETED).toBe('agent.action.completed');
  });
  it('AGENT_ESCALATED is "agent.escalated"', () => {
    expect(EventTypes.AGENT_ESCALATED).toBe('agent.escalated');
  });
  it('AGENT_COMPLETED is "agent.completed"', () => {
    expect(EventTypes.AGENT_COMPLETED).toBe('agent.completed');
  });
  it('AGENT_FAILED is "agent.failed"', () => {
    expect(EventTypes.AGENT_FAILED).toBe('agent.failed');
  });
});

describe('EventTypes — communication domain', () => {
  it('MESSAGE_RECEIVED is "message.received"', () => {
    expect(EventTypes.MESSAGE_RECEIVED).toBe('message.received');
  });
  it('MESSAGE_SENT is "message.sent"', () => {
    expect(EventTypes.MESSAGE_SENT).toBe('message.sent');
  });
});

describe('EventTypes — authorization domain', () => {
  it('AUTHORIZATION_GRANTED is "authorization.granted"', () => {
    expect(EventTypes.AUTHORIZATION_GRANTED).toBe('authorization.granted');
  });
  it('AUTHORIZATION_DENIED is "authorization.denied"', () => {
    expect(EventTypes.AUTHORIZATION_DENIED).toBe('authorization.denied');
  });
});

describe('EventTypes — identity domain', () => {
  it('USER_AUTHENTICATED is "user.authenticated"', () => {
    expect(EventTypes.USER_AUTHENTICATED).toBe('user.authenticated');
  });
  it('USER_AUTHENTICATION_FAILED is "user.authentication.failed"', () => {
    expect(EventTypes.USER_AUTHENTICATION_FAILED).toBe('user.authentication.failed');
  });
});

describe('EventTypes — knowledge domain', () => {
  it('KNOWLEDGE_EMBEDDED is "knowledge.embedded"', () => {
    expect(EventTypes.KNOWLEDGE_EMBEDDED).toBe('knowledge.embedded');
  });
  it('KNOWLEDGE_RETRIEVED is "knowledge.retrieved"', () => {
    expect(EventTypes.KNOWLEDGE_RETRIEVED).toBe('knowledge.retrieved');
  });
});

describe('EventTypes — scheduler domain', () => {
  it('SCHEDULER_JOB_STARTED is "scheduler.job.started"', () => {
    expect(EventTypes.SCHEDULER_JOB_STARTED).toBe('scheduler.job.started');
  });
  it('SCHEDULER_JOB_COMPLETED is "scheduler.job.completed"', () => {
    expect(EventTypes.SCHEDULER_JOB_COMPLETED).toBe('scheduler.job.completed');
  });
  it('SCHEDULER_JOB_FAILED is "scheduler.job.failed"', () => {
    expect(EventTypes.SCHEDULER_JOB_FAILED).toBe('scheduler.job.failed');
  });
});

describe('EventTypes — delegation domain', () => {
  it('DELEGATION_CREATED is "delegation.created"', () => {
    expect(EventTypes.DELEGATION_CREATED).toBe('delegation.created');
  });
  it('DELEGATION_REVOKED is "delegation.revoked"', () => {
    expect(EventTypes.DELEGATION_REVOKED).toBe('delegation.revoked');
  });
  it('DELEGATION_EXPIRED is "delegation.expired"', () => {
    expect(EventTypes.DELEGATION_EXPIRED).toBe('delegation.expired');
  });
});

describe('EventTypes — total count', () => {
  it('has at least 60 event types defined', () => {
    expect(Object.keys(EventTypes).length).toBeGreaterThanOrEqual(60);
  });
});
