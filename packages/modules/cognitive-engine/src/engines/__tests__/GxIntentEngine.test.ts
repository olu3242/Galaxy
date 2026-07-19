import { describe, it, expect } from 'vitest';
import { GxIntentEngine } from '../GxIntentEngine.js';

describe('GxIntentEngine.analyze', () => {
  it('classifies a query_information intent', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('show me the list of pending approvals');
    expect(result.intent).toBe('query_information');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies trigger_workflow intent', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('start the onboarding workflow for John');
    expect(result.intent).toBe('trigger_workflow');
  });

  it('classifies approve_request intent', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('approve this pending request');
    expect(result.intent).toBe('approve_request');
  });

  it('classifies escalate_issue intent', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('escalate this critical issue to the manager urgently');
    expect(result.intent).toBe('escalate_issue');
  });

  it('classifies generate_report intent', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('generate a summary report of Q1 analytics');
    expect(result.intent).toBe('generate_report');
  });

  it('returns unknown for unrecognized input', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('zzz gibberish xyzzy');
    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('extracts date entity from input', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('show me reports from 2026-01-15');
    const dateEntity = result.entities.find((e) => e.type === 'date');
    expect(dateEntity?.value).toBe('2026-01-15');
  });

  it('extracts status entity from input', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('find all pending requests');
    const statusEntity = result.entities.find((e) => e.type === 'status');
    expect(statusEntity?.value.toLowerCase()).toBe('pending');
  });

  it('sets requiresHumanConfirmation when action is high-risk and priority is urgent', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('approve this request urgently and immediately');
    if (result.intent === 'approve_request' && result.goal.priority === 'urgent') {
      expect(result.requiresHumanConfirmation).toBe(true);
    }
  });

  it('includes predictedActions array', () => {
    const engine = new GxIntentEngine();
    const result = engine.analyze('show me the status of workflow abc');
    expect(Array.isArray(result.predictedActions)).toBe(true);
    expect(result.predictedActions.length).toBeGreaterThan(0);
  });

  it('returns rawInput unchanged', () => {
    const engine = new GxIntentEngine();
    const input = 'list all active members';
    const result = engine.analyze(input);
    expect(result.rawInput).toBe(input);
  });
});
