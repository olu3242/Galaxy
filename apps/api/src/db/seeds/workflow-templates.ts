import type { Pool } from 'pg';

export interface WorkflowTemplate {
  name: string;
  description: string;
  category: string;
  definition: Record<string, unknown>;
  isActive: boolean;
}

const TEMPLATES: WorkflowTemplate[] = [
  {
    name: 'Leave Request',
    description: 'Employee leave request with manager approval',
    category: 'hr',
    definition: {
      states: ['submitted', 'pending_approval', 'approved', 'rejected', 'completed'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'pending_approval', trigger: 'submit' },
        { from: 'pending_approval', to: 'approved', trigger: 'approve' },
        { from: 'pending_approval', to: 'rejected', trigger: 'reject' },
        { from: 'approved', to: 'completed', trigger: 'complete' },
      ],
      slaHours: 24,
      requiresApproval: true,
      approvalLevels: 1,
    },
    isActive: true,
  },
  {
    name: 'Expense Approval',
    description: 'Expense reimbursement with amount-based routing',
    category: 'finance',
    definition: {
      states: [
        'submitted',
        'pending_approval',
        'pending_finance_review',
        'approved',
        'rejected',
        'completed',
      ],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'pending_approval', trigger: 'submit' },
        { from: 'pending_approval', to: 'pending_finance_review', trigger: 'escalate_high_value' },
        { from: 'pending_approval', to: 'approved', trigger: 'approve' },
        { from: 'pending_finance_review', to: 'approved', trigger: 'finance_approve' },
        { from: 'pending_approval', to: 'rejected', trigger: 'reject' },
        { from: 'pending_finance_review', to: 'rejected', trigger: 'reject' },
        { from: 'approved', to: 'completed', trigger: 'complete' },
      ],
      slaHours: 48,
      requiresApproval: true,
      approvalLevels: 2,
      escalationThresholdAmount: 50000,
    },
    isActive: true,
  },
  {
    name: 'Incident Report',
    description: 'Incident reporting with immediate escalation',
    category: 'operations',
    definition: {
      states: ['reported', 'under_investigation', 'resolved', 'closed'],
      initialState: 'reported',
      transitions: [
        { from: 'reported', to: 'under_investigation', trigger: 'assign' },
        { from: 'under_investigation', to: 'resolved', trigger: 'resolve' },
        { from: 'resolved', to: 'closed', trigger: 'close' },
      ],
      slaHours: 4,
      requiresApproval: false,
      approvalLevels: 0,
      immediateEscalation: true,
    },
    isActive: true,
  },
];

export async function seedWorkflowTemplates(pool: Pool): Promise<void> {
  for (const template of TEMPLATES) {
    await pool.query(
      `INSERT INTO workflow_definitions (name, description, category, definition, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         definition = EXCLUDED.definition,
         is_active = EXCLUDED.is_active`,
      [
        template.name,
        template.description,
        template.category,
        JSON.stringify(template.definition),
        template.isActive,
      ],
    );
  }
}
