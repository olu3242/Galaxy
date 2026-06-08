import type { Pool } from 'pg';
import type { HealthScoreService } from './HealthScoreService.js';
import type { InsightService } from './InsightService.js';
import type { RiskDetectionService } from './RiskDetectionService.js';

export interface IntelligenceEvent {
  type: string;
  tenantId: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export class OperationalIntelligenceService {
  constructor(
    private readonly pool: Pool,
    private readonly healthScoreService: HealthScoreService,
    private readonly insightService: InsightService,
    private readonly riskDetectionService: RiskDetectionService,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async handleEvent(event: IntelligenceEvent): Promise<void> {
    const { type, tenantId } = event;

    switch (type) {
      case 'workflow.completed': {
        const score = await this.healthScoreService.computeWorkflowEffectiveness(tenantId);
        await this.insightService.generateInsights(tenantId, 'workflow', { score: score.score });
        break;
      }

      case 'task.completed':
      case 'automation.executed': {
        const score = await this.healthScoreService.computeOrganizationHealth(tenantId);
        await this.insightService.generateInsights(tenantId, 'operational', {
          score: score.score,
        });
        break;
      }

      case 'message.sent':
      case 'notification.sent': {
        const score = await this.healthScoreService.computeCommunicationEffectiveness(tenantId);
        await this.insightService.generateInsights(tenantId, 'communication', {
          score: score.score,
        });
        break;
      }

      case 'approval.granted':
      case 'approval.rejected': {
        const risks = await this.riskDetectionService.detectRisks(tenantId);
        if (risks.length > 0) {
          await this.insightService.generateInsights(tenantId, 'risk', {
            riskCount: risks.length,
          });
        }
        break;
      }

      case 'member.created':
      case 'member.updated': {
        const score = await this.healthScoreService.computeMemberEngagement(tenantId);
        await this.insightService.generateInsights(tenantId, 'engagement', {
          score: score.score,
        });
        break;
      }

      case 'audit.recorded': {
        await this.setTenantContext(tenantId);
        await this.insightService.generateInsights(tenantId, 'compliance', {
          event: event.payload,
        });
        break;
      }

      default:
        await this.setTenantContext(tenantId);
        break;
    }
  }
}
