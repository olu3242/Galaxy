import crypto from 'node:crypto';
import type { Pool } from 'pg';
import {
  ConversationSessionService,
  ConversationMessageService,
  ConversationIntelligenceService,
  type ChannelType,
  type SessionStatus,
} from '@galaxy/conversation';

export interface IncomingMessage {
  /** External WhatsApp conversation/thread id. */
  externalId: string;
  /** Raw sender phone — NEVER stored or logged; used only for participant id derivation. */
  fromPhone: string;
  organizationId: string;
  channelType: ChannelType;
  text: string;
  correlationId?: string;
}

export interface RuntimeResponse {
  sessionId: string;
  inboundMessageId: string;
  outboundMessageId: string;
  replyText: string;
  intent: string;
  sentiment: string;
  requiresHumanHandoff: boolean;
  correlationId: string;
}

/**
 * ConversationRuntimeService — WhatsApp multi-turn conversation orchestrator.
 *
 * Manages session lifecycle, persists messages, runs intelligence analysis,
 * and returns a structured reply for the outbound WhatsApp message.
 *
 * Security:
 *  - fromPhone is NEVER stored or logged (PII).
 *  - All SQL executed through parameterized queries in underlying services.
 *  - Tenant context is set inside each service call.
 */
export class ConversationRuntimeService {
  private readonly sessions: ConversationSessionService;
  private readonly messages: ConversationMessageService;
  private readonly intelligence: ConversationIntelligenceService;

  constructor(private readonly pool: Pool) {
    this.sessions = new ConversationSessionService(pool);
    this.messages = new ConversationMessageService(pool);
    this.intelligence = new ConversationIntelligenceService();
  }

  /** Process an inbound WhatsApp message and return a structured reply. */
  async handleInbound(incoming: IncomingMessage): Promise<RuntimeResponse> {
    const correlationId = incoming.correlationId ?? crypto.randomUUID();

    // Resolve or create a session keyed by (org, channelType, externalId).
    // createSession uses ON CONFLICT … DO UPDATE so it is idempotent.
    const participantId = this.deriveParticipantId(incoming.fromPhone, incoming.organizationId);
    const session = await this.sessions.createSession(
      incoming.organizationId,
      incoming.channelType,
      incoming.externalId,
      participantId,
    );

    // Run intelligence analysis on the inbound text
    const intent = this.intelligence.extractIntent(incoming.text);
    const sentiment = this.intelligence.detectSentiment(incoming.text);
    const urgency = this.intelligence.scoreUrgency(incoming.text);

    // Persist the inbound message
    const inboundMsg = await this.messages.ingestMessage(
      incoming.organizationId,
      session.id,
      'inbound',
      incoming.text,
      { correlationId, intent, sentiment, urgency },
    );

    // Build a reply
    const requiresHumanHandoff = urgency >= 0.6 || intent === 'support_request';
    const replyText = requiresHumanHandoff
      ? 'Thank you for reaching out. A team member will be with you shortly.'
      : `Received your message. We are processing your ${intent.replace(/_/g, ' ')} request.`;

    // Persist the outbound reply
    const outboundMsg = await this.messages.ingestMessage(
      incoming.organizationId,
      session.id,
      'outbound',
      replyText,
      { correlationId, intent, sentiment },
    );

    // Update session context with latest intelligence signals
    await this.sessions.updateSessionContext(incoming.organizationId, session.id, {
      lastIntent: intent,
      lastSentiment: sentiment,
      lastUrgency: urgency,
      correlationId,
    });

    return {
      sessionId: session.id,
      inboundMessageId: inboundMsg.id,
      outboundMessageId: outboundMsg.id,
      replyText,
      intent,
      sentiment,
      requiresHumanHandoff,
      correlationId,
    };
  }

  /** Close a session after it has been resolved or expired. */
  async closeSession(
    organizationId: string,
    sessionId: string,
    _status: Extract<SessionStatus, 'CLOSED'> = 'CLOSED',
  ): Promise<void> {
    await this.sessions.closeSession(organizationId, sessionId);
  }

  /**
   * Derive a stable, non-reversible participant id from phone + org.
   * Raw phone numbers are never persisted (PII).
   */
  private deriveParticipantId(phone: string, organizationId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${organizationId}:${phone}`)
      .digest('hex')
      .slice(0, 36);
  }
}
