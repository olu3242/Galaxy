const URGENCY_KEYWORDS = ['urgent', 'emergency', 'asap', 'critical', 'immediately', 'help'];
const NEGATIVE_KEYWORDS = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'angry'];
const POSITIVE_KEYWORDS = ['good', 'great', 'excellent', 'love', 'best', 'wonderful', 'happy'];

export class ConversationIntelligenceService {
  detectLanguage(_content: string): string {
    return 'en';
  }

  detectSentiment(content: string): string {
    const lower = content.toLowerCase();
    const hasNegative = NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw));
    const hasPositive = POSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasNegative && !hasPositive) return 'negative';
    if (hasPositive && !hasNegative) return 'positive';
    return 'neutral';
  }

  extractIntent(content: string): string {
    const lower = content.toLowerCase();
    if (lower.includes('help') || lower.includes('support')) return 'support_request';
    if (lower.includes('buy') || lower.includes('purchase') || lower.includes('order')) return 'purchase_intent';
    if (lower.includes('cancel') || lower.includes('refund')) return 'cancellation';
    if (lower.includes('status') || lower.includes('track')) return 'status_inquiry';
    return 'general_inquiry';
  }

  scoreUrgency(content: string): number {
    const lower = content.toLowerCase();
    const matches = URGENCY_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    return Math.min(matches / URGENCY_KEYWORDS.length, 1.0);
  }
}
