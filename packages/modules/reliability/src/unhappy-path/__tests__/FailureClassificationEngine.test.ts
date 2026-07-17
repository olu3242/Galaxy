import { describe, it, expect } from 'vitest';
import { FailureClassificationEngine } from '../FailureClassificationEngine.js';

describe('FailureClassificationEngine', () => {
  const engine = new FailureClassificationEngine();

  describe('classify', () => {
    it('returns critical severity for org_misconfiguration', () => {
      const result = engine.classify('org_misconfiguration');
      expect(result.category).toBe('org_misconfiguration');
      expect(result.severity).toBe('critical');
      expect(result.confidence).toBe(0.9);
      expect(result.suggestedAction).toContain('admin');
    });

    it('returns high severity for workflow_failure', () => {
      const result = engine.classify('workflow_failure');
      expect(result.severity).toBe('high');
    });

    it('returns low severity for duplicate_request', () => {
      const result = engine.classify('duplicate_request');
      expect(result.severity).toBe('low');
    });

    it('returns medium severity for agent_failure', () => {
      const result = engine.classify('agent_failure');
      expect(result.severity).toBe('medium');
    });

    it('includes suggested action for every category', () => {
      const categories = [
        'low_confidence_intent',
        'duplicate_request',
        'wrong_department_routing',
        'wrong_assignee_routing',
        'workflow_failure',
        'approval_failure',
        'escalation_failure',
        'agent_failure',
        'knowledge_failure',
        'communication_failure',
        'org_misconfiguration',
        'data_integrity_failure',
      ] as const;
      for (const cat of categories) {
        const result = engine.classify(cat);
        expect(result.suggestedAction.length).toBeGreaterThan(0);
      }
    });
  });

  describe('detectCategory', () => {
    it('detects low_confidence_intent from "unclear request"', () => {
      expect(engine.detectCategory('unclear request from user')).toBe('low_confidence_intent');
    });

    it('detects duplicate_request from "duplicate message"', () => {
      expect(engine.detectCategory('this is a duplicate submission')).toBe('duplicate_request');
    });

    it('detects wrong_department_routing from "wrong department"', () => {
      expect(engine.detectCategory('sent to wrong department')).toBe('wrong_department_routing');
    });

    it('detects wrong_assignee_routing from "assignee"', () => {
      expect(engine.detectCategory('wrong assignee selected')).toBe('wrong_assignee_routing');
    });

    it('detects workflow_failure from "workflow error"', () => {
      expect(engine.detectCategory('workflow failed to complete')).toBe('workflow_failure');
    });

    it('detects approval_failure from "approval"', () => {
      expect(engine.detectCategory('approval was denied')).toBe('approval_failure');
    });

    it('detects escalation_failure from "escalation"', () => {
      expect(engine.detectCategory('escalation timed out')).toBe('escalation_failure');
    });

    it('detects agent_failure from "agent"', () => {
      expect(engine.detectCategory('agent could not respond')).toBe('agent_failure');
    });

    it('detects knowledge_failure from "knowledge"', () => {
      expect(engine.detectCategory('knowledge base miss')).toBe('knowledge_failure');
    });

    it('detects communication_failure from "communication"', () => {
      expect(engine.detectCategory('communication error occurred')).toBe('communication_failure');
    });

    it('detects org_misconfiguration from "config"', () => {
      expect(engine.detectCategory('config is broken')).toBe('org_misconfiguration');
    });

    it('falls back to data_integrity_failure for unrecognised text', () => {
      expect(engine.detectCategory('something totally random happened')).toBe(
        'data_integrity_failure',
      );
    });
  });
});
