import type { Pool } from 'pg';
import type { MetricsService } from './MetricsService.js';
import type { KPIService } from './KPIService.js';

export interface GalaxyEventPayload {
  type: string;
  tenantId: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export class AnalyticsService {
  constructor(
    private readonly pool: Pool,
    private readonly metricsService: MetricsService,
    private readonly kpiService: KPIService,
  ) {}

  private async setTenantContext(organizationId: string): Promise<void> {
    await this.pool.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      organizationId,
    ]);
  }

  async handleEvent(event: GalaxyEventPayload): Promise<void> {
    const { type, tenantId, correlationId } = event;

    switch (type) {
      case 'workflow.completed':
        await this.metricsService.recordMetric({
          organizationId: tenantId,
          name: 'workflow.completions',
          category: 'workflow',
          value: 1,
          unit: 'count',
          period: 'daily',
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          dimensions: { correlationId },
        });
        break;

      case 'message.sent':
        await this.metricsService.recordMetric({
          organizationId: tenantId,
          name: 'messages.sent',
          category: 'communication',
          value: 1,
          unit: 'count',
          period: 'daily',
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          dimensions: { correlationId },
        });
        break;

      case 'member.created':
        await this.metricsService.recordMetric({
          organizationId: tenantId,
          name: 'members.created',
          category: 'people',
          value: 1,
          unit: 'count',
          period: 'daily',
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          dimensions: { correlationId },
        });
        break;

      default:
        await this.setTenantContext(tenantId);
        break;
    }
  }
}
