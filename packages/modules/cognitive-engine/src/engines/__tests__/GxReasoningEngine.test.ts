import { describe, it, expect } from 'vitest';
import { GxReasoningEngine } from '../GxReasoningEngine.js';
import type { EvidenceItem } from '../GxReasoningEngine.js';

describe('GxReasoningEngine.reason — chain_of_thought (default)', () => {
  it('returns a ReasoningTrace with expected shape', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({ question: 'Should we proceed?' });
    expect(trace.strategy).toBe('chain_of_thought');
    expect(trace.question).toBe('Should we proceed?');
    expect(Array.isArray(trace.steps)).toBe(true);
    expect(trace.steps.length).toBeGreaterThan(0);
    expect(typeof trace.overallConfidence).toBe('number');
    expect(typeof trace.durationMs).toBe('number');
  });

  it('requiresMoreEvidence is true when confidence < 0.6', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({ question: '?', maxSteps: 1 });
    if (trace.overallConfidence < 0.6) {
      expect(trace.requiresMoreEvidence).toBe(true);
    }
  });

  it('includes high-reliability evidence in step conclusions', () => {
    const engine = new GxReasoningEngine();
    const evidence: EvidenceItem[] = [
      { source: 'db', content: 'sales grew 20%', reliability: 0.9 },
    ];
    const trace = engine.reason({ question: 'What is the revenue trend?', evidence });
    const evidenceStep = trace.steps.find((s) => s.description.includes('evidence'));
    expect(evidenceStep).toBeDefined();
  });

  it('applies context facts when provided', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({
      question: 'Is the team ready?',
      contextFacts: { headcount: 12, openTickets: 3 },
    });
    const contextStep = trace.steps.find((s) => s.description.includes('context'));
    expect(contextStep).toBeDefined();
  });
});

describe('GxReasoningEngine.reason — tree_of_thought', () => {
  it('explores multiple hypotheses', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({ question: 'Best path?', strategy: 'tree_of_thought' });
    expect(trace.strategy).toBe('tree_of_thought');
    const hypothesisSteps = trace.steps.filter((s) => s.description.includes('Hypothesis'));
    expect(hypothesisSteps.length).toBeGreaterThan(0);
  });

  it('final step selects optimal path', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({ question: 'Choose?', strategy: 'tree_of_thought' });
    const lastStep = trace.steps[trace.steps.length - 1];
    expect(lastStep?.description).toContain('optimal');
  });
});

describe('GxReasoningEngine.reason — evidence_gathering', () => {
  it('produces evidence-source steps', () => {
    const engine = new GxReasoningEngine();
    const evidence: EvidenceItem[] = [
      { source: 'crm', content: 'customer churn 5%', reliability: 0.8 },
      { source: 'crm', content: 'NPS score 45', reliability: 0.7 },
    ];
    const trace = engine.reason({
      question: 'Customer health?',
      strategy: 'evidence_gathering',
      evidence,
    });
    const sourceStep = trace.steps.find((s) => s.description.includes('crm'));
    expect(sourceStep).toBeDefined();
  });

  it('sets requiresMoreEvidence=false when evidence reliability is high', () => {
    const engine = new GxReasoningEngine();
    const evidence: EvidenceItem[] = [
      { source: 'src', content: 'very reliable fact', reliability: 0.95 },
    ];
    const trace = engine.reason({
      question: 'Is data reliable?',
      strategy: 'evidence_gathering',
      evidence,
    });
    expect(trace.requiresMoreEvidence).toBe(false);
  });

  it('handles empty evidence gracefully', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({
      question: 'No evidence?',
      strategy: 'evidence_gathering',
      evidence: [],
    });
    expect(trace.steps.length).toBeGreaterThan(0);
  });
});

describe('GxReasoningEngine.reason — maxSteps', () => {
  it('respects maxSteps limit', () => {
    const engine = new GxReasoningEngine();
    const trace = engine.reason({
      question: 'Limit me',
      strategy: 'chain_of_thought',
      maxSteps: 2,
      contextFacts: { key: 'value' },
      evidence: [{ source: 'src', content: 'some fact', reliability: 0.8 }],
    });
    expect(trace.steps.length).toBeLessThanOrEqual(2);
  });
});
