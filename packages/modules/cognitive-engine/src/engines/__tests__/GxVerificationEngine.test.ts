import { describe, it, expect } from 'vitest';
import { GxVerificationEngine } from '../GxVerificationEngine.js';

describe('GxVerificationEngine.verify', () => {
  it('returns passed when all schema fields match', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { name: 'Alice', age: 30 },
      expectedSchema: { name: 'string', age: 'number' },
    });
    expect(result.status).toBe('passed');
    expect(result.policyCompliant).toBe(true);
  });

  it('returns failed when schema field has wrong type', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { name: 42 },
      expectedSchema: { name: 'string' },
    });
    expect(result.status).toBe('failed');
    const check = result.checks.find((c) => c.name === 'schema:name');
    expect(check?.passed).toBe(false);
  });

  it('returns failed when business rule is violated', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { amount: -5 },
      businessRules: [{ rule: 'amount must be positive', check: (o) => (o.amount as number) > 0 }],
    });
    expect(result.status).toBe('failed');
  });

  it('passes business rule when condition is met', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { status: 'approved' },
      businessRules: [{ rule: 'status valid', check: (o) => o.status === 'approved' }],
    });
    const ruleCheck = result.checks.find((c) => c.name.startsWith('rule:'));
    expect(ruleCheck?.passed).toBe(true);
  });

  it('returns failed for empty output', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({ output: {} });
    expect(result.status).toBe('failed');
    const emptyCheck = result.checks.find((c) => c.name === 'non_empty_output');
    expect(emptyCheck?.passed).toBe(false);
  });

  it('detects policy constraint violation', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { message: 'this contains password in plain' },
      policyConstraints: ['password'],
    });
    expect(result.policyCompliant).toBe(false);
    const policyCheck = result.checks.find((c) => c.name.startsWith('policy:'));
    expect(policyCheck?.passed).toBe(false);
  });

  it('satisfies policy constraint when forbidden term absent', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { message: 'safe content here' },
      policyConstraints: ['restricted_term'],
    });
    expect(result.policyCompliant).toBe(true);
  });

  it('confidenceScore is ratio of passed checks', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { x: 'hello' },
      expectedSchema: { x: 'string', y: 'number' },
    });
    const total = result.checks.length;
    const passed = result.checks.filter((c) => c.passed).length;
    expect(result.confidenceScore).toBeCloseTo(passed / total);
  });

  it('requiresHumanReview is true for failed status', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({
      output: { val: 'wrong' },
      expectedSchema: { val: 'number' },
    });
    expect(result.requiresHumanReview).toBe(true);
  });

  it('summary includes check counts', () => {
    const engine = new GxVerificationEngine();
    const result = engine.verify({ output: { ok: true } });
    expect(result.summary).toMatch(/\d+\/\d+ checks passed/);
  });
});
