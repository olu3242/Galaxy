export type ReasoningStrategy = 'chain_of_thought' | 'tree_of_thought' | 'evidence_gathering';

export interface ReasoningStep {
  stepNumber: number;
  description: string;
  evidence: string[];
  conclusion: string;
  confidence: number;
}

export interface ReasoningTrace {
  strategy: ReasoningStrategy;
  question: string;
  steps: ReasoningStep[];
  finalConclusion: string;
  overallConfidence: number;
  requiresMoreEvidence: boolean;
  durationMs: number;
}

export interface EvidenceItem {
  source: string;
  content: string;
  reliability: number;
}

export interface ReasoningInput {
  question: string;
  strategy?: ReasoningStrategy;
  evidence?: EvidenceItem[];
  contextFacts?: Record<string, unknown>;
  maxSteps?: number;
}

export class GxReasoningEngine {
  reason(input: ReasoningInput): ReasoningTrace {
    const start = performance.now();
    const strategy = input.strategy ?? 'chain_of_thought';
    const maxSteps = input.maxSteps ?? 5;

    const steps =
      strategy === 'tree_of_thought'
        ? this.treeOfThought(input, maxSteps)
        : strategy === 'evidence_gathering'
          ? this.evidenceGathering(input, maxSteps)
          : this.chainOfThought(input, maxSteps);

    const overallConfidence =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

    const finalConclusion =
      steps[steps.length - 1]?.conclusion ?? 'Insufficient information to conclude.';

    return {
      strategy,
      question: input.question,
      steps,
      finalConclusion,
      overallConfidence,
      requiresMoreEvidence: overallConfidence < 0.6,
      durationMs: Math.round(performance.now() - start),
    };
  }

  private chainOfThought(input: ReasoningInput, maxSteps: number): ReasoningStep[] {
    const steps: ReasoningStep[] = [];
    const evidence = input.evidence ?? [];

    // Step 1: Understand the question
    steps.push({
      stepNumber: 1,
      description: 'Understand and decompose the question',
      evidence: [],
      conclusion: `Question identified: "${input.question.slice(0, 100)}"`,
      confidence: 0.9,
    });

    // Step 2: Gather contextual evidence
    if (evidence.length > 0 && steps.length < maxSteps) {
      const highReliability = evidence.filter((e) => e.reliability >= 0.7);
      steps.push({
        stepNumber: 2,
        description: 'Evaluate available evidence',
        evidence: highReliability.map((e) => e.content.slice(0, 100)),
        conclusion:
          highReliability.length > 0
            ? `Found ${String(highReliability.length)} reliable evidence items`
            : 'Evidence quality is low — proceed with caution',
        confidence: highReliability.length > 0 ? 0.8 : 0.4,
      });
    }

    // Step 3: Apply context facts
    if (
      input.contextFacts &&
      Object.keys(input.contextFacts).length > 0 &&
      steps.length < maxSteps
    ) {
      const factCount = Object.keys(input.contextFacts).length;
      steps.push({
        stepNumber: steps.length + 1,
        description: 'Apply organizational context',
        evidence: Object.entries(input.contextFacts)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${String(v)}`),
        conclusion: `Context provides ${String(factCount)} relevant facts`,
        confidence: 0.75,
      });
    }

    // Final step: Synthesize
    if (steps.length < maxSteps) {
      const avgConf = steps.reduce((s, st) => s + st.confidence, 0) / Math.max(steps.length, 1);
      steps.push({
        stepNumber: steps.length + 1,
        description: 'Synthesize findings into conclusion',
        evidence: steps.map((s) => s.conclusion),
        conclusion:
          avgConf >= 0.7
            ? `Based on available evidence, a ${avgConf >= 0.8 ? 'high' : 'moderate'}-confidence answer can be formed.`
            : 'Insufficient evidence for a confident conclusion — human review recommended.',
        confidence: avgConf,
      });
    }

    return steps;
  }

  private treeOfThought(input: ReasoningInput, maxSteps: number): ReasoningStep[] {
    // Explore multiple hypotheses in parallel branches, pick highest-confidence path
    const hypotheses = [
      { label: 'Hypothesis A (optimistic)', confidence: 0.7 },
      { label: 'Hypothesis B (conservative)', confidence: 0.8 },
      { label: 'Hypothesis C (worst-case)', confidence: 0.6 },
    ].slice(0, Math.min(3, maxSteps - 1));

    const steps: ReasoningStep[] = hypotheses.map((h, i) => ({
      stepNumber: i + 1,
      description: `Explore ${h.label}`,
      evidence: input.evidence ? input.evidence.slice(0, 2).map((e) => e.content.slice(0, 80)) : [],
      conclusion: `${h.label} suggests proceeding with ${h.confidence >= 0.75 ? 'moderate' : 'low'} confidence`,
      confidence: h.confidence,
    }));

    const best = [...steps].sort((a, b) => b.confidence - a.confidence)[0];
    steps.push({
      stepNumber: steps.length + 1,
      description: 'Select optimal reasoning path',
      evidence: steps.map((s) => s.conclusion),
      conclusion:
        best !== undefined
          ? `Selected: ${best.description} (confidence ${best.confidence.toFixed(2)})`
          : 'No viable path found',
      confidence: best !== undefined ? best.confidence : 0,
    });

    return steps;
  }

  private evidenceGathering(input: ReasoningInput, maxSteps: number): ReasoningStep[] {
    const steps: ReasoningStep[] = [];
    const evidence = input.evidence ?? [];

    steps.push({
      stepNumber: 1,
      description: 'Identify required evidence types',
      evidence: [],
      conclusion: `Need evidence for: ${input.question.slice(0, 80)}`,
      confidence: 0.85,
    });

    if (evidence.length > 0 && steps.length < maxSteps) {
      const bySource = new Map<string, EvidenceItem[]>();
      for (const e of evidence) {
        if (!bySource.has(e.source)) bySource.set(e.source, []);
        const sourceItems = bySource.get(e.source);
        if (sourceItems !== undefined) sourceItems.push(e);
      }

      for (const [source, items] of bySource) {
        if (steps.length >= maxSteps - 1) break;
        steps.push({
          stepNumber: steps.length + 1,
          description: `Analyze evidence from ${source}`,
          evidence: items.map((i) => i.content.slice(0, 80)),
          conclusion: `${source}: ${String(items.length)} items with avg reliability ${(items.reduce((s, i) => s + i.reliability, 0) / items.length).toFixed(2)}`,
          confidence: items.reduce((s, i) => s + i.reliability, 0) / items.length,
        });
      }
    }

    const evidenceConfidence =
      evidence.length > 0 ? evidence.reduce((s, e) => s + e.reliability, 0) / evidence.length : 0.3;

    steps.push({
      stepNumber: steps.length + 1,
      description: 'Conclude from gathered evidence',
      evidence: steps.map((s) => s.conclusion),
      conclusion:
        evidenceConfidence >= 0.7
          ? 'Evidence supports a confident decision'
          : 'Evidence is insufficient — escalate for review',
      confidence: evidenceConfidence,
    });

    return steps;
  }
}
