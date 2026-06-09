import type { Pool } from 'pg';
import type { HealthScore } from '../types.js';
import { HealthScoringService } from '../scoring/HealthScoringService.js';

export class HealthMonitorService {
  private readonly scoringService: HealthScoringService;

  constructor(private readonly pool: Pool) {
    this.scoringService = new HealthScoringService(pool);
  }

  async computeOverallHealth(orgId: string): Promise<HealthScore> {
    const scores = await this.scoringService.getAllLatestScores(orgId);
    const dimensionScores = scores.filter((s) => s.dimension !== 'overall');
    const avg =
      dimensionScores.length > 0
        ? dimensionScores.reduce((sum, s) => sum + s.score, 0) / dimensionScores.length
        : 50;
    return this.scoringService.recordScore(orgId, 'overall', Math.round(avg), {}, []);
  }

  async flagAtRisk(orgId: string): Promise<HealthScore[]> {
    const scores = await this.scoringService.getAllLatestScores(orgId);
    return scores.filter((s) => s.status === 'at_risk' || s.status === 'critical');
  }
}
