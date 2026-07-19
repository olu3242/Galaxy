/**
 * Approved public knowledge base for the Galaxy Product Assistant.
 * Only content sourced from public-facing materials (landing page, public docs,
 * pricing, FAQs, case studies) belongs here.
 *
 * NEVER include: architecture docs, internal prompts, source code references,
 * agent specs, workflow implementation details, or roadmap information.
 */

export const PUBLIC_KNOWLEDGE_BASE = `
# Galaxy — Public Product Knowledge Base

## What is Galaxy?
Galaxy is a multi-tenant Organization Operating System that helps organizations run their operations entirely through WhatsApp. It brings structure, accountability, and automation to the conversations your team is already having — no new apps, no training required.

Galaxy is designed for organizations that operate across distributed locations: churches, NGOs, schools, cooperatives, professional associations, community networks, and civic organizations.

## Problems Galaxy Solves
- Disconnected communication between branches, departments, and teams
- Lack of accountability for decisions and tasks
- No audit trail for approvals and actions
- Manual, error-prone reporting processes
- Difficulty coordinating workflows across large distributed teams
- No central view of organizational health or member activity

## Who Is Galaxy For?
Galaxy is purpose-built for:
- **Churches and faith communities** — member management, giving, events, branch coordination
- **NGOs and field organizations** — beneficiary tracking, field reporting, program management
- **Schools and academic institutions** — student/staff workflows, approvals, communications
- **Cooperatives and savings groups** — contribution tracking, loan management, meeting records
- **Professional associations** — member dues, certifications, event management
- **Community networks** — volunteer coordination, resource allocation
- **Civic organizations** — governance workflows, committee management

Galaxy works best for organizations with 50 to 50,000+ members operating across multiple locations.

## Core Features
- **WhatsApp-native workflows** — submit reports, approvals, and requests directly from WhatsApp
- **Organization hierarchy** — platform, organization, division, region, branch, department, team
- **Approval workflows** — route decisions to the right people with full audit trail
- **Member management** — roles, permissions, onboarding, delegation
- **Reporting and analytics** — real-time organizational health, activity reports
- **AI-assisted governance** — intelligent routing, anomaly detection, optimization suggestions
- **Multi-department support** — each department operates independently within one organization
- **Role-based access** — granular permissions for admins, managers, and members

## WhatsApp Integration
Yes — Galaxy is built around WhatsApp. Members interact with Galaxy entirely through WhatsApp messages. Administrators and leaders access a web dashboard for configuration and oversight. No one needs to download a new app.

## Security and Data Privacy
- Each organization's data is completely isolated — no cross-organization data access
- All data is encrypted in transit and at rest
- Industry-standard security practices throughout
- Designed for organizations handling sensitive member, beneficiary, and financial information

## Onboarding
Most organizations are fully operational within 24–48 hours. Galaxy includes:
- Pre-built templates for each organization type
- Hands-on onboarding assistance for early access organizations
- Guided configuration wizard
- Dedicated support during rollout

## Pricing
Galaxy offers three plans:
- **Starter** — ideal for small organizations, essential features
- **Growth** — for growing organizations needing advanced workflows and analytics
- **Enterprise** — for large, multi-location organizations needing custom configuration, SLAs, and priority support

Contact our sales team for current pricing details at sales@galaxyos.com.

## Support
- In-app chat support
- Email support: support@galaxyos.com
- Dedicated onboarding specialist for all plans
- Enterprise customers receive priority support with SLA guarantees

## International Availability
Galaxy is designed for global organizations with a focus on:
- Africa
- The Caribbean
- Latin America
- South and Southeast Asia

Multiple languages and regional configurations are supported.

## Demo and Sales
- Book a demo: Visit galaxyos.com/demo or contact sales@galaxyos.com
- Sales inquiries: sales@galaxyos.com
- Phone: Available upon request through the demo booking flow

## Industries Served
Churches, NGOs, schools, cooperatives, professional associations, community networks, civic organizations, faith-based organizations, charities, foundations, trade associations.

## Frequently Asked Questions

**Do members need to download a new app?**
No. Members use WhatsApp exactly as they always have. Galaxy works behind the scenes.

**How long does setup take?**
Most organizations are live within 24–48 hours with hands-on onboarding support.

**Can we start with one department?**
Yes. Many organizations start with one department and expand organization-wide over time.

**Does Galaxy work internationally?**
Yes. Galaxy supports organizations globally with a focus on Africa, the Caribbean, Latin America, and South/Southeast Asia.

**What size organizations use Galaxy?**
From 50 members to 50,000+. Galaxy scales with your organization.

**Can Galaxy automate our workflows?**
Yes. Galaxy can route approvals, trigger notifications, generate reports, and handle repetitive tasks automatically based on your configured rules.

**Is there a free trial?**
Contact sales@galaxyos.com or book a demo to discuss trial options.
`;

export const RESTRICTED_TOPICS = [
  'architecture',
  'source code',
  'database',
  'schema',
  'kubernetes',
  'docker',
  'redis',
  'postgres',
  'postgresql',
  'api key',
  'secret',
  'jwt',
  'token',
  'webhook implementation',
  'internal',
  'prompt',
  'embedding',
  'vector',
  'llm',
  'language model',
  'anthropic',
  'openai',
  'model',
  'agent implementation',
  'loop engine',
  'runtime',
  'event bus',
  'queue',
  'worker',
  'roadmap',
  'future feature',
  'planned feature',
  'competitor',
  'infrastructure',
  'cloud',
  'aws',
  'gcp',
  'azure',
  'admin portal',
  'system prompt',
  'instructions',
  'training data',
  'fine-tuning',
  'rbac implementation',
  'abac implementation',
  'audit log implementation',
  'migration',
  'deployment',
] as const;

export const ESCALATION_TRIGGERS = [
  'enterprise',
  'government',
  'healthcare',
  'hipaa',
  'gdpr',
  'compliance certificate',
  'soc 2',
  'iso 27001',
  'security questionnaire',
  'procurement',
  'partnership',
  'reseller',
  'white label',
  'custom integration',
  'api access',
  'technical architecture',
  'negotiat',
  'discount',
  'legal',
  'contract',
  'data residency',
  'data sovereignty',
  'existing customer',
  'cancellation',
  'refund',
] as const;

export function detectRestrictedTopic(message: string): boolean {
  const lower = message.toLowerCase();
  return RESTRICTED_TOPICS.some((topic) => lower.includes(topic));
}

export function detectEscalationRequired(message: string): boolean {
  const lower = message.toLowerCase();
  return ESCALATION_TRIGGERS.some((trigger) => lower.includes(trigger));
}

export function detectPromptInjection(message: string): boolean {
  const injectionPatterns = [
    /ignore (previous|above|prior|all) (instructions?|prompts?|context)/i,
    /you are now/i,
    /forget (everything|your instructions|your system prompt)/i,
    /act as (a |an )?(different|new|other)/i,
    /pretend (you are|to be)/i,
    /override (your|the) (instructions?|system|prompt)/i,
    /\[SYSTEM\]/i,
    /\[INST\]/i,
    /<\|system\|>/i,
    /reveal (your|the) (system )?prompt/i,
    /what are your instructions/i,
    /repeat (everything|all) (above|before)/i,
  ];
  return injectionPatterns.some((p) => p.test(message));
}
