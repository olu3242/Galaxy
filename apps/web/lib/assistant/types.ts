export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

export interface LeadData {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  industry?: string;
  country?: string;
  orgSize?: string;
  useCase?: string;
  preferredContact?: 'email' | 'phone' | 'whatsapp';
}

export interface DemoRequest {
  name: string;
  email: string;
  company: string;
  numUsers?: string;
  preferredDate?: string;
  preferredTime?: string;
  country?: string;
  industry?: string;
}

export interface AssistantRequest {
  messages: Array<{ role: MessageRole; content: string }>;
  sessionId: string;
  leadData?: LeadData;
}

export interface AssistantResponse {
  content: string;
  requiresEscalation: boolean;
  escalationReason?: string | undefined;
  suggestedActions?: string[] | undefined;
  extractedLead?: Partial<LeadData> | undefined;
}

export const QUICK_ACTIONS = [
  { label: 'What is Galaxy?', prompt: 'What is Galaxy and what does it do?' },
  { label: 'Industries We Serve', prompt: 'What types of organizations use Galaxy?' },
  { label: 'Key Features', prompt: 'What are the main features of Galaxy?' },
  { label: 'WhatsApp Integration', prompt: 'How does Galaxy work with WhatsApp?' },
  { label: 'Pricing', prompt: 'What pricing plans does Galaxy offer?' },
  { label: 'Book a Demo', prompt: 'I would like to book a demo.' },
  { label: 'Contact Sales', prompt: 'How can I contact the Galaxy sales team?' },
  { label: 'Security', prompt: 'How secure is Galaxy? How is our data protected?' },
] as const;
