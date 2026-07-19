import { describe, it, expect } from 'vitest';
import { WorkflowTemplateService } from '../templates/WorkflowTemplateService.js';

describe('WorkflowTemplateService.getTemplate', () => {
  const service = new WorkflowTemplateService();

  it('returns the healthcare patient-onboarding template with steps array', () => {
    const template = service.getTemplate('healthcare', 'patient-onboarding');
    expect(template).not.toBeNull();
    expect(template).toHaveProperty('steps');
    expect(Array.isArray(template?.steps)).toBe(true);
  });

  it('healthcare steps include Register and Schedule Appointment', () => {
    const template = service.getTemplate('healthcare', 'patient-onboarding');
    const steps = template?.steps;
    expect(steps).toContain('Register');
    expect(steps).toContain('Schedule Appointment');
  });

  it('returns the church new-member template', () => {
    const template = service.getTemplate('church', 'new-member');
    expect(template).not.toBeNull();
    expect(template?.steps).toContain('Welcome Form');
  });

  it('returns the school student-enrollment template', () => {
    const template = service.getTemplate('school', 'student-enrollment');
    expect(template).not.toBeNull();
    expect(template?.steps).toContain('Application');
    expect(template?.steps).toContain('Orientation');
  });

  it('returns the microfinance loan-application template', () => {
    const template = service.getTemplate('microfinance', 'loan-application');
    expect(template).not.toBeNull();
    expect(template?.steps).toContain('KYC');
    expect(template?.steps).toContain('Disbursement');
  });

  it('returns the ngo beneficiary-registration template', () => {
    const template = service.getTemplate('ngo', 'beneficiary-registration');
    expect(template).not.toBeNull();
    expect(template?.steps).toContain('Intake Form');
  });

  it('returns the sme invoice-approval template', () => {
    const template = service.getTemplate('sme', 'invoice-approval');
    expect(template).not.toBeNull();
    expect(template?.steps).toContain('Submit Invoice');
    expect(template?.steps).toContain('Payment Processing');
  });

  it('returns null for an unknown industry', () => {
    const template = service.getTemplate('unknown-industry', 'patient-onboarding');
    expect(template).toBeNull();
  });

  it('returns null for a known industry with an unknown useCase', () => {
    const template = service.getTemplate('healthcare', 'loan-application');
    expect(template).toBeNull();
  });

  it('is case-sensitive — mismatched case returns null', () => {
    const template = service.getTemplate('Healthcare', 'patient-onboarding');
    expect(template).toBeNull();
  });
});

describe('WorkflowTemplateService.listTemplates', () => {
  const service = new WorkflowTemplateService();

  it('returns all six templates', () => {
    const templates = service.listTemplates();
    expect(templates).toHaveLength(6);
  });

  it('each entry has industry, useCase, and name fields only', () => {
    const templates = service.listTemplates();
    for (const t of templates) {
      expect(Object.keys(t).sort()).toEqual(['industry', 'name', 'useCase']);
    }
  });

  it('does not expose raw template data (no steps)', () => {
    const templates = service.listTemplates();
    for (const t of templates) {
      expect(t).not.toHaveProperty('steps');
      expect(t).not.toHaveProperty('template');
    }
  });

  it('includes healthcare industry entry', () => {
    const templates = service.listTemplates();
    expect(templates).toContainEqual(
      expect.objectContaining({ industry: 'healthcare', useCase: 'patient-onboarding' }),
    );
  });

  it('includes sme invoice-approval entry', () => {
    const templates = service.listTemplates();
    expect(templates).toContainEqual(
      expect.objectContaining({
        industry: 'sme',
        useCase: 'invoice-approval',
        name: 'Invoice Approval',
      }),
    );
  });
});
