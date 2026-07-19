import crypto from 'node:crypto';
import type { Pool } from 'pg';
import {
  ConversationSessionService,
  ConversationMessageService,
  ConversationIntelligenceService,
  type ChannelType,
  type SessionStatus,
} from '@galaxy/conversation';

export type MediaType = 'audio' | 'image' | 'video' | 'document';

export interface IncomingMessage {
  /** External WhatsApp conversation/thread id. */
  externalId: string;
  /** Raw sender phone — NEVER stored or logged; used only for participant id derivation. */
  fromPhone: string;
  organizationId: string;
  channelType: ChannelType;
  /** Text content; empty string when mediaType is set. */
  text: string;
  correlationId?: string;
  /** Set when the message carries a media attachment instead of plain text. */
  mediaType?: MediaType;
  /** Opaque media reference (URL, media-id, etc.) — stored for agent review, never exposed. */
  mediaRef?: string;
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
  /** True when the current flow was interrupted and a new flow started. */
  interrupted?: boolean;
}

export interface SessionResumeState {
  session: {
    id: string;
    status: SessionStatus;
    context: Record<string, unknown>;
    memory: Record<string, unknown>;
  };
  inProgress: Record<string, unknown> | null;
}

// Keywords that signal the user wants to interrupt the current flow and start fresh.
const INTERRUPTION_KEYWORDS =
  /\b(actually|wait|stop|cancel|never\s+mind|nevermind|new\s+request|instead|forget\s+it|start\s+over|disregard)\b/i;

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

    // ------------------------------------------------------------------
    // Media message handling — respond with placeholder and store metadata
    // ------------------------------------------------------------------
    if (incoming.mediaType === 'audio' || incoming.mediaType === 'image') {
      return this.handleMediaMessage(incoming, correlationId);
    }

    // Resolve or create a session keyed by (org, channelType, externalId).
    // createSession uses ON CONFLICT … DO UPDATE so it is idempotent.
    const participantId = this.deriveParticipantId(incoming.fromPhone, incoming.organizationId);
    const session = await this.sessions.createSession(
      incoming.organizationId,
      incoming.channelType,
      incoming.externalId,
      participantId,
    );

    // ------------------------------------------------------------------
    // Interruption detection
    // ------------------------------------------------------------------
    let interrupted = false;
    const isProcessing = session.status === 'ACTIVE' || session.status === 'WAITING';
    if (isProcessing && INTERRUPTION_KEYWORDS.test(incoming.text)) {
      interrupted = true;
      // Save the in-progress context to session memory before clearing it
      const savedFlow: Record<string, unknown> = {
        savedAt: new Date().toISOString(),
        previousContext: session.context,
      };
      await this.sessions.updateSessionContext(incoming.organizationId, session.id, {
        ...session.context,
        _savedFlow: savedFlow,
        // Reset active flow signals
        lastIntent: undefined,
        lastSentiment: undefined,
        lastUrgency: undefined,
      });
    }

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
      { correlationId, intent, sentiment, urgency, interrupted },
    );

    // Build a reply
    const requiresHumanHandoff = urgency >= 0.6 || intent === 'support_request';
    let replyText: string;
    if (interrupted) {
      replyText =
        'Understood, I have paused what we were doing. How can I help you with your new request?';
    } else if (requiresHumanHandoff) {
      replyText = 'Thank you for reaching out. A team member will be with you shortly.';
    } else {
      replyText = `Received your message. We are processing your ${intent.replace(/_/g, ' ')} request.`;
    }

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
      ...(interrupted ? { interrupted: true } : {}),
    };
  }

  /** Return the current resume state for a session. */
  async getResumeState(
    organizationId: string,
    sessionId: string,
  ): Promise<SessionResumeState> {
    const session = await this.sessions.getSession(organizationId, sessionId);
    const savedFlow = session.context['_savedFlow'];
    const inProgress =
      savedFlow !== undefined && typeof savedFlow === 'object' && savedFlow !== null
        ? (savedFlow as Record<string, unknown>)
        : null;

    return {
      session: {
        id: session.id,
        status: session.status,
        context: session.context,
        memory: session.memory,
      },
      inProgress,
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Handle an audio or image message with a placeholder reply and metadata storage. */
  private async handleMediaMessage(
    incoming: IncomingMessage,
    correlationId: string,
  ): Promise<RuntimeResponse> {
    const participantId = this.deriveParticipantId(incoming.fromPhone, incoming.organizationId);
    const session = await this.sessions.createSession(
      incoming.organizationId,
      incoming.channelType,
      incoming.externalId,
      participantId,
    );

    const mediaLabel = incoming.mediaType === 'audio' ? 'audio' : 'image';
    const replyText = `I received your ${mediaLabel}. Processing...`;

    // Store media metadata in session context for agent review (mediaRef is opaque, not PII)
    await this.sessions.updateSessionContext(incoming.organizationId, session.id, {
      ...session.context,
      pendingMedia: {
        type: incoming.mediaType,
        ref: incoming.mediaRef ?? null,
        receivedAt: new Date().toISOString(),
        correlationId,
      },
    });

    const inboundMsg = await this.messages.ingestMessage(
      incoming.organizationId,
      session.id,
      'inbound',
      `[${mediaLabel.toUpperCase()}]`,
      { correlationId, mediaType: incoming.mediaType },
    );

    const outboundMsg = await this.messages.ingestMessage(
      incoming.organizationId,
      session.id,
      'outbound',
      replyText,
      { correlationId },
    );

    return {
      sessionId: session.id,
      inboundMessageId: inboundMsg.id,
      outboundMessageId: outboundMsg.id,
      replyText,
      intent: 'media_received',
      sentiment: 'neutral',
      requiresHumanHandoff: false,
      correlationId,
    };
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
