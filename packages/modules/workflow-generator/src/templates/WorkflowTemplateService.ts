interface TemplateEntry {
  industry: string;
  useCase: string;
  name: string;
  template: Record<string, unknown>;
}

const TEMPLATES: TemplateEntry[] = [
  {
    industry: 'healthcare',
    useCase: 'patient-onboarding',
    name: 'Patient Onboarding',
    template: { steps: ['Register', 'Verify Insurance', 'Schedule Appointment', 'Send Reminders'] },
  },
  {
    industry: 'church',
    useCase: 'new-member',
    name: 'New Member Registration',
    template: {
      steps: ['Welcome Form', 'Assign Connect Group', 'Schedule Orientation', 'Send Welcome Pack'],
    },
  },
  {
    industry: 'school',
    useCase: 'student-enrollment',
    name: 'Student Enrollment',
    template: {
      steps: [
        'Application',
        'Document Verification',
        'Fee Payment',
        'Class Assignment',
        'Orientation',
      ],
    },
  },
  {
    industry: 'microfinance',
    useCase: 'loan-application',
    name: 'Loan Application',
    template: {
      steps: ['KYC', 'Credit Assessment', 'Approval', 'Disbursement', 'Repayment Schedule'],
    },
  },
  {
    industry: 'ngo',
    useCase: 'beneficiary-registration',
    name: 'Beneficiary Registration',
    template: {
      steps: ['Intake Form', 'Needs Assessment', 'Program Assignment', 'Case File Creation'],
    },
  },
  {
    industry: 'sme',
    useCase: 'invoice-approval',
    name: 'Invoice Approval',
    template: {
      steps: ['Submit Invoice', 'Manager Review', 'Finance Approval', 'Payment Processing'],
    },
  },
];

export class WorkflowTemplateService {
  getTemplate(industry: string, useCase: string): Record<string, unknown> | null {
    const entry = TEMPLATES.find((t) => t.industry === industry && t.useCase === useCase);
    return entry?.template ?? null;
  }

  listTemplates(): { industry: string; useCase: string; name: string }[] {
    return TEMPLATES.map(({ industry, useCase, name }) => ({ industry, useCase, name }));
  }
}
