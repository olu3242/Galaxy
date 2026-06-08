import type { COOBriefing, COOAlert, COOItem, Insight } from './types.js';

export class BriefingComposer {
  compose(
    orgId: string,
    healthScore: number,
    insights: Insight[],
    correlationId: string,
  ): Omit<COOBriefing, 'id' | 'createdAt'> {
    const criticalInsights = insights.filter((i) => i.severity === 'critical');
    const warningInsights = insights.filter((i) => i.severity === 'warning');

    const alerts: COOAlert[] = criticalInsights.map((i) => ({
      severity: i.severity,
      title: i.title,
      description: i.description,
    }));

    const items: COOItem[] = warningInsights.map((i) => ({
      category: i.category,
      title: i.title,
      description: i.description,
    }));

    const executiveSummary = this.buildSummary(healthScore, criticalInsights, warningInsights);

    return {
      organizationId: orgId,
      healthScore,
      executiveSummary,
      criticalAlertCount: criticalInsights.length,
      autonomousActionCount: 0,
      pendingActionCount: insights.length,
      briefingData: { insights, alerts, items, actions: [] },
      correlationId,
    };
  }

  private buildSummary(
    healthScore: number,
    critical: Insight[],
    warnings: Insight[],
  ): string {
    const parts: string[] = [];

    const status =
      healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'moderate' : 'needs attention';
    parts.push(
      `Your organization is in ${status} operational state with a health score of ${String(Math.round(healthScore))}/100.`,
    );

    if (critical.length > 0) {
      parts.push(
        `There are ${String(critical.length)} critical issue(s) requiring immediate attention: ${critical.map((i) => i.title).join(', ')}.`,
      );
    }

    if (warnings.length > 0) {
      parts.push(`${String(warnings.length)} warning(s) were flagged for review.`);
    }

    if (critical.length === 0 && warnings.length === 0) {
      parts.push('No significant operational issues were detected in this review period.');
    }

    parts.push('Review the actions below and approve any recommended interventions.');

    return parts.join(' ');
  }
}
