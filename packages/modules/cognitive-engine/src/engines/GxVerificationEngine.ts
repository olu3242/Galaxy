export type VerificationStatus = 'passed' | 'failed' | 'warning' | 'requires_human_review';

export interface VerificationCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface VerificationResult {
  status: VerificationStatus;
  checks: VerificationCheck[];
  confidenceScore: number;
  halluccinationRisk: number;
  policyCompliant: boolean;
  requiresHumanReview: boolean;
  summary: string;
}

export interface VerificationInput {
  output: Record<string, unknown>;
  expectedSchema?: Record<string, string>; // field -> expected type
  businessRules?: { rule: string; check: (output: Record<string, unknown>) => boolean }[];
  policyConstraints?: string[];
  originalInput?: Record<string, unknown>;
}

export class GxVerificationEngine {
  verify(input: VerificationInput): VerificationResult {
    const checks: VerificationCheck[] = [];

    // 1. Schema validation
    if (input.expectedSchema) {
      for (const [field, expectedType] of Object.entries(input.expectedSchema)) {
        const actual = input.output[field];
        const actualType = actual === null ? 'null' : typeof actual;
        const passed = expectedType === 'null' ? actual === null : actualType === expectedType;
        checks.push({
          name: `schema:${field}`,
          passed,
          severity: passed ? 'info' : 'error',
          message: passed
            ? `Field "${field}" has expected type ${expectedType}`
            : `Field "${field}" expected ${expectedType}, got ${actualType}`,
        });
      }
    }

    // 2. Business rule validation
    for (const { rule, check } of input.businessRules ?? []) {
      const passed = check(input.output);
      checks.push({
        name: `rule:${rule.slice(0, 40)}`,
        passed,
        severity: passed ? 'info' : 'error',
        message: passed ? `Rule "${rule}" passed` : `Rule "${rule}" violated`,
      });
    }

    // 3. Hallucination risk detection (heuristic)
    const halluccinationRisk = this.assessHallucinationRisk(input);
    if (halluccinationRisk > 0.7) {
      checks.push({
        name: 'hallucination_risk',
        passed: false,
        severity: 'warning',
        message: `High hallucination risk detected (${halluccinationRisk.toFixed(2)})`,
      });
    }

    // 4. Non-empty output check
    const hasContent = Object.keys(input.output).length > 0;
    checks.push({
      name: 'non_empty_output',
      passed: hasContent,
      severity: hasContent ? 'info' : 'error',
      message: hasContent ? 'Output contains data' : 'Output is empty',
    });

    // 5. Policy constraint checks
    const policyConstraints = input.policyConstraints ?? [];
    const policyPassed = policyConstraints.every((constraint) => {
      const outputStr = JSON.stringify(input.output).toLowerCase();
      const forbidden = constraint.toLowerCase();
      const violated = outputStr.includes(forbidden);
      checks.push({
        name: `policy:${constraint.slice(0, 30)}`,
        passed: !violated,
        severity: violated ? 'error' : 'info',
        message: violated
          ? `Policy constraint violated: ${constraint}`
          : `Policy constraint satisfied: ${constraint}`,
      });
      return !violated;
    });

    const errors = checks.filter((c) => !c.passed && c.severity === 'error');
    const warnings = checks.filter((c) => !c.passed && c.severity === 'warning');

    let status: VerificationStatus;
    if (errors.length > 0) status = 'failed';
    else if (warnings.length > 0) status = 'warning';
    else if (halluccinationRisk > 0.5) status = 'requires_human_review';
    else status = 'passed';

    const passedCount = checks.filter((c) => c.passed).length;
    const confidenceScore = checks.length > 0 ? passedCount / checks.length : 1.0;

    return {
      status,
      checks,
      confidenceScore,
      halluccinationRisk,
      policyCompliant: policyPassed,
      requiresHumanReview: status === 'requires_human_review' || status === 'failed',
      summary: `${String(passedCount)}/${String(checks.length)} checks passed. Status: ${status}.`,
    };
  }

  private assessHallucinationRisk(input: VerificationInput): number {
    const outputStr = JSON.stringify(input.output);
    let risk = 0.1; // base risk

    // Numeric claims without source
    if (/d{4,}/.test(outputStr) && !input.originalInput) risk += 0.2;

    // Very long string fields (may be fabricated)
    const longStrings = Object.values(input.output).filter(
      (v) => typeof v === 'string' && v.length > 500,
    );
    if (longStrings.length > 0) risk += 0.15;

    // Output contains facts not present in input
    if (input.originalInput) {
      const inputStr = JSON.stringify(input.originalInput).toLowerCase();
      const outputKeys = Object.keys(input.output);
      const unexplainedKeys = outputKeys.filter((k) => !inputStr.includes(k.toLowerCase()));
      risk += Math.min(0.3, unexplainedKeys.length * 0.05);
    }

    return Math.min(1.0, risk);
  }
}
