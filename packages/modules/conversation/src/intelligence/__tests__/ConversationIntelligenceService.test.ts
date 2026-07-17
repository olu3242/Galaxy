import { describe, it, expect } from 'vitest';
import { ConversationIntelligenceService } from '../ConversationIntelligenceService.js';

describe('ConversationIntelligenceService.detectLanguage', () => {
  it('returns "en" for any input (stub implementation)', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.detectLanguage('Hello world')).toBe('en');
    expect(svc.detectLanguage('Hola mundo')).toBe('en');
    expect(svc.detectLanguage('')).toBe('en');
  });
});

describe('ConversationIntelligenceService.detectSentiment', () => {
  it('returns "positive" for positive content', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.detectSentiment('This is great and wonderful!')).toBe('positive');
    expect(svc.detectSentiment('I love this, it is excellent')).toBe('positive');
  });

  it('returns "negative" for negative content', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.detectSentiment('This is terrible and awful')).toBe('negative');
    expect(svc.detectSentiment('I hate this, it is the worst')).toBe('negative');
  });

  it('returns "neutral" for neutral content', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.detectSentiment('Please send me an update')).toBe('neutral');
    expect(svc.detectSentiment('')).toBe('neutral');
  });

  it('returns "neutral" when both positive and negative keywords present', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.detectSentiment('great but also terrible')).toBe('neutral');
  });
});

describe('ConversationIntelligenceService.extractIntent', () => {
  it('returns "support_request" for help/support keywords', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.extractIntent('I need help please')).toBe('support_request');
    expect(svc.extractIntent('I need support with my account')).toBe('support_request');
  });

  it('returns "purchase_intent" for buy/purchase/order keywords', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.extractIntent('I want to buy this product')).toBe('purchase_intent');
    expect(svc.extractIntent('How do I purchase?')).toBe('purchase_intent');
    expect(svc.extractIntent('I would like to order')).toBe('purchase_intent');
  });

  it('returns "cancellation" for cancel/refund keywords', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.extractIntent('I want to cancel my subscription')).toBe('cancellation');
    expect(svc.extractIntent('I need a refund')).toBe('cancellation');
  });

  it('returns "status_inquiry" for status/track keywords', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.extractIntent('What is the status of my request?')).toBe('status_inquiry');
    expect(svc.extractIntent('Can I track my package?')).toBe('status_inquiry');
  });

  it('returns "general_inquiry" for unrecognized content', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.extractIntent('Tell me more about your services')).toBe('general_inquiry');
    expect(svc.extractIntent('')).toBe('general_inquiry');
  });
});

describe('ConversationIntelligenceService.scoreUrgency', () => {
  it('returns 0 for non-urgent content', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.scoreUrgency('Please let me know when ready')).toBe(0);
  });

  it('returns a positive score for urgent content', () => {
    const svc = new ConversationIntelligenceService();
    const score = svc.scoreUrgency('This is urgent, I need help immediately!');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('returns 1.0 when all urgency keywords are present', () => {
    const svc = new ConversationIntelligenceService();
    const allKeywords = 'urgent emergency asap critical immediately help';
    expect(svc.scoreUrgency(allKeywords)).toBe(1.0);
  });

  it('score is proportional to number of matches', () => {
    const svc = new ConversationIntelligenceService();
    const oneKeyword = svc.scoreUrgency('urgent');
    const twoKeywords = svc.scoreUrgency('urgent emergency');
    expect(twoKeywords).toBeGreaterThan(oneKeyword);
  });

  it('is case-insensitive', () => {
    const svc = new ConversationIntelligenceService();
    expect(svc.scoreUrgency('URGENT')).toBeGreaterThan(0);
    expect(svc.scoreUrgency('HELP ME NOW')).toBeGreaterThan(0);
  });
});
