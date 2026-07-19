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

  // ── Church ────────────────────────────────────────────────────────────────
  {
    name: 'Church Member Registration',
    description: 'New member registration with pastoral welcome and follow-up',
    category: 'church',
    definition: {
      states: ['submitted', 'pending_pastoral_review', 'welcomed', 'active', 'rejected'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'pending_pastoral_review', trigger: 'submit' },
        { from: 'pending_pastoral_review', to: 'welcomed', trigger: 'approve' },
        { from: 'pending_pastoral_review', to: 'rejected', trigger: 'reject' },
        { from: 'welcomed', to: 'active', trigger: 'complete_onboarding' },
      ],
      slaHours: 72,
      requiresApproval: true,
      approvalLevels: 1,
      industryType: 'church',
    },
    isActive: true,
  },
  {
    name: 'Church Benevolence Request',
    description: 'Financial assistance request reviewed by deacon board',
    category: 'church',
    definition: {
      states: ['submitted', 'deacon_review', 'approved', 'rejected', 'disbursed'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'deacon_review', trigger: 'submit' },
        { from: 'deacon_review', to: 'approved', trigger: 'approve' },
        { from: 'deacon_review', to: 'rejected', trigger: 'reject' },
        { from: 'approved', to: 'disbursed', trigger: 'disburse' },
      ],
      slaHours: 48,
      requiresApproval: true,
      approvalLevels: 2,
      industryType: 'church',
    },
    isActive: true,
  },

  // ── NGO ───────────────────────────────────────────────────────────────────
  {
    name: 'NGO Grant Application',
    description: 'Grant application with multi-level review and donor reporting',
    category: 'ngo',
    definition: {
      states: [
        'submitted',
        'program_review',
        'finance_review',
        'approved',
        'rejected',
        'reporting',
        'closed',
      ],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'program_review', trigger: 'submit' },
        { from: 'program_review', to: 'finance_review', trigger: 'approve_program' },
        { from: 'program_review', to: 'rejected', trigger: 'reject' },
        { from: 'finance_review', to: 'approved', trigger: 'approve_finance' },
        { from: 'finance_review', to: 'rejected', trigger: 'reject' },
        { from: 'approved', to: 'reporting', trigger: 'start_reporting' },
        { from: 'reporting', to: 'closed', trigger: 'close' },
      ],
      slaHours: 168,
      requiresApproval: true,
      approvalLevels: 2,
      industryType: 'ngo',
    },
    isActive: true,
  },
  {
    name: 'NGO Volunteer Onboarding',
    description: 'Volunteer registration with background check and orientation',
    category: 'ngo',
    definition: {
      states: ['applied', 'background_check', 'orientation', 'active', 'rejected'],
      initialState: 'applied',
      transitions: [
        { from: 'applied', to: 'background_check', trigger: 'submit' },
        { from: 'background_check', to: 'orientation', trigger: 'clear' },
        { from: 'background_check', to: 'rejected', trigger: 'reject' },
        { from: 'orientation', to: 'active', trigger: 'complete' },
      ],
      slaHours: 120,
      requiresApproval: true,
      approvalLevels: 1,
      industryType: 'ngo',
    },
    isActive: true,
  },

  // ── School ────────────────────────────────────────────────────────────────
  {
    name: 'School Admission Application',
    description: 'Student admission with document verification and interview',
    category: 'school',
    definition: {
      states: ['submitted', 'document_review', 'interview', 'admitted', 'waitlisted', 'rejected'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'document_review', trigger: 'submit' },
        { from: 'document_review', to: 'interview', trigger: 'docs_approved' },
        { from: 'document_review', to: 'rejected', trigger: 'reject' },
        { from: 'interview', to: 'admitted', trigger: 'admit' },
        { from: 'interview', to: 'waitlisted', trigger: 'waitlist' },
        { from: 'interview', to: 'rejected', trigger: 'reject' },
      ],
      slaHours: 336,
      requiresApproval: true,
      approvalLevels: 2,
      industryType: 'school',
    },
    isActive: true,
  },
  {
    name: 'School Fee Payment',
    description: 'School fee payment confirmation with receipt generation',
    category: 'school',
    definition: {
      states: ['submitted', 'payment_pending', 'confirmed', 'receipt_issued'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'payment_pending', trigger: 'submit' },
        { from: 'payment_pending', to: 'confirmed', trigger: 'confirm_payment' },
        { from: 'confirmed', to: 'receipt_issued', trigger: 'issue_receipt' },
      ],
      slaHours: 24,
      requiresApproval: false,
      approvalLevels: 0,
      industryType: 'school',
    },
    isActive: true,
  },

  // ── Cooperative ───────────────────────────────────────────────────────────
  {
    name: 'Cooperative Loan Application',
    description: 'Member loan request with credit committee review',
    category: 'cooperative',
    definition: {
      states: [
        'submitted',
        'eligibility_check',
        'credit_review',
        'approved',
        'rejected',
        'disbursed',
      ],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'eligibility_check', trigger: 'submit' },
        { from: 'eligibility_check', to: 'credit_review', trigger: 'eligible' },
        { from: 'eligibility_check', to: 'rejected', trigger: 'ineligible' },
        { from: 'credit_review', to: 'approved', trigger: 'approve' },
        { from: 'credit_review', to: 'rejected', trigger: 'reject' },
        { from: 'approved', to: 'disbursed', trigger: 'disburse' },
      ],
      slaHours: 72,
      requiresApproval: true,
      approvalLevels: 2,
      industryType: 'cooperative',
    },
    isActive: true,
  },

  // ── Political Party ───────────────────────────────────────────────────────
  {
    name: 'Party Membership Registration',
    description: 'Political party member registration with ward endorsement',
    category: 'political',
    definition: {
      states: ['submitted', 'ward_review', 'executive_approval', 'registered', 'rejected'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'ward_review', trigger: 'submit' },
        { from: 'ward_review', to: 'executive_approval', trigger: 'ward_approve' },
        { from: 'ward_review', to: 'rejected', trigger: 'reject' },
        { from: 'executive_approval', to: 'registered', trigger: 'approve' },
        { from: 'executive_approval', to: 'rejected', trigger: 'reject' },
      ],
      slaHours: 48,
      requiresApproval: true,
      approvalLevels: 2,
      industryType: 'political',
    },
    isActive: true,
  },

  // ── Creator / Creator Economy ─────────────────────────────────────────────
  {
    name: 'Creator Collaboration Request',
    description: 'Brand collaboration request with contract review',
    category: 'creator',
    definition: {
      states: ['submitted', 'review', 'negotiation', 'contract_signed', 'active', 'rejected'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'review', trigger: 'submit' },
        { from: 'review', to: 'negotiation', trigger: 'interested' },
        { from: 'review', to: 'rejected', trigger: 'reject' },
        { from: 'negotiation', to: 'contract_signed', trigger: 'sign' },
        { from: 'negotiation', to: 'rejected', trigger: 'decline' },
        { from: 'contract_signed', to: 'active', trigger: 'activate' },
      ],
      slaHours: 72,
      requiresApproval: true,
      approvalLevels: 1,
      industryType: 'creator',
    },
    isActive: true,
  },

  // ── Public Safety ─────────────────────────────────────────────────────────
  {
    name: 'Public Safety Incident Response',
    description: 'Emergency incident report with command escalation',
    category: 'public_safety',
    definition: {
      states: ['reported', 'dispatched', 'on_scene', 'resolved', 'after_action', 'closed'],
      initialState: 'reported',
      transitions: [
        { from: 'reported', to: 'dispatched', trigger: 'dispatch' },
        { from: 'dispatched', to: 'on_scene', trigger: 'arrive' },
        { from: 'on_scene', to: 'resolved', trigger: 'resolve' },
        { from: 'resolved', to: 'after_action', trigger: 'submit_report' },
        { from: 'after_action', to: 'closed', trigger: 'close' },
      ],
      slaHours: 1,
      requiresApproval: false,
      approvalLevels: 0,
      immediateEscalation: true,
      industryType: 'public_safety',
    },
    isActive: true,
  },

  // ── Government ────────────────────────────────────────────────────────────
  {
    name: 'Government Service Request',
    description: 'Citizen service request with departmental routing',
    category: 'government',
    definition: {
      states: ['submitted', 'triaged', 'processing', 'pending_documents', 'approved', 'rejected'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'triaged', trigger: 'triage' },
        { from: 'triaged', to: 'processing', trigger: 'assign' },
        { from: 'processing', to: 'pending_documents', trigger: 'request_docs' },
        { from: 'pending_documents', to: 'processing', trigger: 'docs_received' },
        { from: 'processing', to: 'approved', trigger: 'approve' },
        { from: 'processing', to: 'rejected', trigger: 'reject' },
      ],
      slaHours: 120,
      requiresApproval: true,
      approvalLevels: 1,
      industryType: 'government',
    },
    isActive: true,
  },
  {
    name: 'Government Procurement Request',
    description: 'Public procurement with compliance and tender process',
    category: 'government',
    definition: {
      states: ['submitted', 'compliance_check', 'tender_open', 'evaluation', 'awarded', 'rejected'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'compliance_check', trigger: 'submit' },
        { from: 'compliance_check', to: 'tender_open', trigger: 'compliant' },
        { from: 'compliance_check', to: 'rejected', trigger: 'reject' },
        { from: 'tender_open', to: 'evaluation', trigger: 'close_tender' },
        { from: 'evaluation', to: 'awarded', trigger: 'award' },
        { from: 'evaluation', to: 'rejected', trigger: 'cancel' },
      ],
      slaHours: 720,
      requiresApproval: true,
      approvalLevels: 3,
      requiresPublicTender: true,
      industryType: 'government',
    },
    isActive: true,
  },

  // ── Association ───────────────────────────────────────────────────────────
  {
    name: 'Association Membership Application',
    description: 'Professional association membership with endorsement',
    category: 'association',
    definition: {
      states: ['submitted', 'endorsement', 'committee_review', 'approved', 'rejected', 'active'],
      initialState: 'submitted',
      transitions: [
        { from: 'submitted', to: 'endorsement', trigger: 'submit' },
        { from: 'endorsement', to: 'committee_review', trigger: 'endorsed' },
        { from: 'endorsement', to: 'rejected', trigger: 'not_endorsed' },
        { from: 'committee_review', to: 'approved', trigger: 'approve' },
        { from: 'committee_review', to: 'rejected', trigger: 'reject' },
        { from: 'approved', to: 'active', trigger: 'activate' },
      ],
      slaHours: 240,
      requiresApproval: true,
      approvalLevels: 2,
      industryType: 'association',
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
