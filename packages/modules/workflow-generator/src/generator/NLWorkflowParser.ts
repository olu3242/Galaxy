import crypto from 'node:crypto';

export interface NLParseInput {
  text: string;
  organizationId: string;
  channel: 'whatsapp' | 'web' | 'email' | 'document';
  context?: Record<string, unknown>;
}

export interface DraftStep {
  id: string;
  title: string;
  description: string;
  stepType: 'action' | 'approval' | 'notification' | 'condition' | 'wait';
  assignedRole?: string;
  dependsOn: string[];
  estimatedMs: number;
  conditions?: Record<string, unknown>;
}

export interface ParsedWorkflowDraft {
  title: string;
  description: string;
  steps: DraftStep[];
  estimatedDurationMs: number;
  requiredApprovals: string[];
  detectedOwners: string[];
  detectedDeadlines: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Keyword lists (pure regex/heuristics — no external API calls)
// ---------------------------------------------------------------------------

const ACTION_VERBS =
  /\b(approve|review|send|notify|create|update|check|submit|process|verify|validate|assign|complete|escalate|close|open|schedule|remind|collect|generate|sign|upload|download|archive|delete|transfer|pay|request|confirm)\b/gi;

const APPROVAL_PATTERNS =
  /(?:requires?\s+approval\s+from|must\s+be\s+approved\s+by|needs?\s+sign[- ]?off(?:\s+from)?|awaiting\s+approval\s+from)\s+([^,.;]+)/gi;

const OWNER_PATTERNS =
  /\b(?:by|from|assign(?:ed)?\s+to|owner[:\s]+|responsible[:\s]+|handled\s+by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|(?:the\s+)?[a-z]+\s+(?:team|department|manager|officer|director|lead|head))/gi;

const ROLE_MENTIONS =
  /\b(HR|finance|legal|compliance|IT|operations|executive|manager|director|officer|team lead|admin|supervisor|CEO|CFO|CTO|COO)\b/gi;

const DEPENDENCY_SPLIT =
  /,?\s+(?:then|after(?:\s+that)?|once|when|after\s+which|following\s+that)\s+/gi;

const DEADLINE_PATTERNS =
  /\b(?:by\s+(?:end\s+of\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|month|year|eom|eod)|within\s+\d+\s+(?:hour|day|week|month)s?|before\s+(?:end\s+of\s+(?:day|month|week|quarter|year)|[A-Z][a-z]+\s+\d+)|in\s+\d+\s+(?:hour|day|week)s?)\b/gi;

const CONDITION_PATTERNS =
  /\b(?:if|when|unless|provided\s+that|in\s+case)\s+([^,.;]+(?:(?:>|<|=|>=|<=|!=)\s*[\w.]+)?)/gi;

// Estimated time per step type in ms (rough heuristics)
const STEP_TIME_MS: Record<DraftStep['stepType'], number> = {
  action: 15 * 60 * 1000, // 15 min
  approval: 4 * 60 * 60 * 1000, // 4 hours
  notification: 1 * 60 * 1000, // 1 min
  condition: 2 * 60 * 1000, // 2 min
  wait: 24 * 60 * 60 * 1000, // 24 hours (conservative)
};

// ---------------------------------------------------------------------------
// Helper: determine step type from sentence
// ---------------------------------------------------------------------------
function classifyStepType(sentence: string): DraftStep['stepType'] {
  const lower = sentence.toLowerCase();
  if (/\b(approve|sign[- ]?off|authoris|authoriz|review\s+and\s+approv|grant\s+permission)\b/.test(lower))
    return 'approval';
  if (/\b(notify|alert|inform|send\s+(?:an?\s+)?(?:email|message|notification|reminder|sms|whatsapp))\b/.test(lower))
    return 'notification';
  if (/\b(if|when|check\s+whether|validate|verify\s+that|condition)\b/.test(lower))
    return 'condition';
  if (/\b(wait|pause|hold|delay|until|pending|standby)\b/.test(lower))
    return 'wait';
  return 'action';
}

// ---------------------------------------------------------------------------
// Helper: extract assigned role from a sentence
// ---------------------------------------------------------------------------
function extractRole(sentence: string): string | undefined {
  const matches: string[] = [];

  let m: RegExpExecArray | null;

  // Reset lastIndex before use
  const ownerRe = new RegExp(OWNER_PATTERNS.source, OWNER_PATTERNS.flags);
  while ((m = ownerRe.exec(sentence)) !== null) {
    if (m[1]) matches.push(m[1].trim());
  }

  const roleRe = new RegExp(ROLE_MENTIONS.source, ROLE_MENTIONS.flags);
  while ((m = roleRe.exec(sentence)) !== null) {
    if (m[0]) matches.push(m[0].trim());
  }

  return matches[0];
}

// ---------------------------------------------------------------------------
// Helper: extract conditions from a sentence
// ---------------------------------------------------------------------------
function extractConditions(sentence: string): Record<string, unknown> | undefined {
  const conds: Record<string, unknown> = {};
  const re = new RegExp(CONDITION_PATTERNS.source, CONDITION_PATTERNS.flags);
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(sentence)) !== null) {
    if (m[1]) {
      conds[`condition_${String(idx)}`] = m[1].trim();
      idx++;
    }
  }
  return idx > 0 ? conds : undefined;
}

// ---------------------------------------------------------------------------
// Helper: derive a short title from a sentence
// ---------------------------------------------------------------------------
function deriveTitle(sentence: string): string {
  // Capitalise first word, keep ≤ 60 chars
  const cleaned = sentence.trim().replace(/\s+/g, ' ');
  const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return title.length > 60 ? title.slice(0, 57) + '...' : title;
}

// ---------------------------------------------------------------------------
// Helper: score confidence based on signal density
// ---------------------------------------------------------------------------
function scoreConfidence(
  text: string,
  steps: DraftStep[],
  owners: string[],
  deadlines: string[],
): number {
  let score = 0.3; // base

  // More steps → more confidence we understood the description
  if (steps.length >= 2) score += 0.15;
  if (steps.length >= 4) score += 0.1;

  // Owners detected
  if (owners.length > 0) score += 0.15;

  // Deadlines detected
  if (deadlines.length > 0) score += 0.1;

  // Action verbs found
  const verbCount = (text.match(ACTION_VERBS) ?? []).length;
  if (verbCount >= 2) score += 0.1;
  if (verbCount >= 5) score += 0.1;

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Main parser class
// ---------------------------------------------------------------------------
export class NLWorkflowParser {
  /**
   * Parse plain English / WhatsApp conversation text into a structured
   * workflow draft. Runs synchronously with regex/heuristics only — no
   * external API calls.
   */
  parse(input: NLParseInput): ParsedWorkflowDraft {
    const { text } = input;

    // ------------------------------------------------------------------
    // 1. Split into steps using dependency connectors
    // ------------------------------------------------------------------
    const rawSegments = text.split(DEPENDENCY_SPLIT).filter((s) => s.trim().length > 0);

    // ------------------------------------------------------------------
    // 2. Collect global signals (approvals, owners, deadlines)
    // ------------------------------------------------------------------
    const requiredApprovals: string[] = [];
    {
      const re = new RegExp(APPROVAL_PATTERNS.source, APPROVAL_PATTERNS.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[1]) requiredApprovals.push(m[1].trim());
      }
    }

    const detectedOwners: string[] = [];
    {
      // Named roles in the full text
      const roleRe = new RegExp(ROLE_MENTIONS.source, ROLE_MENTIONS.flags);
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = roleRe.exec(text)) !== null) {
        const val = m[0].trim();
        if (!seen.has(val)) {
          seen.add(val);
          detectedOwners.push(val);
        }
      }
      // Owner phrases
      const ownerRe = new RegExp(OWNER_PATTERNS.source, OWNER_PATTERNS.flags);
      while ((m = ownerRe.exec(text)) !== null) {
        const val = m[1]?.trim();
        if (val && !seen.has(val)) {
          seen.add(val);
          detectedOwners.push(val);
        }
      }
    }

    const detectedDeadlines: string[] = [];
    {
      const re = new RegExp(DEADLINE_PATTERNS.source, DEADLINE_PATTERNS.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        detectedDeadlines.push(m[0].trim());
      }
    }

    // ------------------------------------------------------------------
    // 3. Build DraftStep list
    // ------------------------------------------------------------------
    const steps: DraftStep[] = rawSegments.map((seg, _idx) => {
      const stepType = classifyStepType(seg);
      const assignedRole = extractRole(seg);
      const conditions = extractConditions(seg);
      const stepId = crypto.randomUUID();

      return {
        id: stepId,
        title: deriveTitle(seg),
        description: seg.trim(),
        stepType,
        estimatedMs: STEP_TIME_MS[stepType],
        dependsOn: [], // filled in below
        ...(assignedRole !== undefined ? { assignedRole } : {}),
        ...(conditions !== undefined ? { conditions } : {}),
      };
    });

    // Wire sequential dependencies (each step depends on the previous one)
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const cur = steps[i];
      if (prev && cur) {
        cur.dependsOn = [prev.id];
      }
    }

    // ------------------------------------------------------------------
    // 4. Derive title from first sentence / overall text
    // ------------------------------------------------------------------
    const firstSentence = text.split(/[.!?]/)[0] ?? text;
    const title = deriveTitle(firstSentence.length > 5 ? firstSentence : text);

    // ------------------------------------------------------------------
    // 5. Estimated total duration (sum of steps)
    // ------------------------------------------------------------------
    const estimatedDurationMs = steps.reduce((sum, s) => sum + s.estimatedMs, 0);

    // ------------------------------------------------------------------
    // 6. Confidence score
    // ------------------------------------------------------------------
    const confidence = scoreConfidence(text, steps, detectedOwners, detectedDeadlines);

    return {
      title,
      description: text.trim(),
      steps,
      estimatedDurationMs,
      requiredApprovals: [...new Set(requiredApprovals)],
      detectedOwners: [...new Set(detectedOwners)],
      detectedDeadlines: [...new Set(detectedDeadlines)],
      confidence,
    };
  }
}
