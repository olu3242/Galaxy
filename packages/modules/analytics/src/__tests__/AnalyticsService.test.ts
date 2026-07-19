import { describe, it, expect, vi } from 'vitest';
import type { MetricsService } from '../services/MetricsService.js';
import type { KPIService } from '../services/KPIService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const CORRELATION_ID = '00000000-0000-0000-0000-000000000099';

function makeMetricsService(): MetricsService {
  return {
    recordMetric: vi.fn().mockResolvedValue({}),
    getMetrics: vi.fn().mockResolvedValue([]),
    aggregateMetric: vi.fn().mockResolvedValue({}),
  } as unknown as MetricsService;
}

function makeKPIService(): KPIService {
  return {
    setKPI: vi.fn(),
    getKPIs: vi.fn(),
    evaluateKPI: vi.fn(),
  } as unknown as KPIService;
}

function makePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
}

describe('AnalyticsService.handleEvent', () => {
  it('calls recordMetric for workflow.completed event', async () => {
    const metricsService = makeMetricsService();
    const kpiService = makeKPIService();
    const pool = makePool();
    const svc = new AnalyticsService(pool as never, metricsService, kpiService);

    await svc.handleEvent({
      type: 'workflow.completed',
      tenantId: ORG,
      correlationId: CORRELATION_ID,
      payload: {},
    });

    expect(metricsService.recordMetric).toHaveBeenCalledOnce();
    const call = (metricsService.recordMetric as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      organizationId: ORG,
      name: 'workflow.completions',
      category: 'workflow',
      value: 1,
    });
  });

  it('calls recordMetric for message.sent event', async () => {
    const metricsService = makeMetricsService();
    const kpiService = makeKPIService();
    const pool = makePool();
    const svc = new AnalyticsService(pool as never, metricsService, kpiService);

    await svc.handleEvent({
      type: 'message.sent',
      tenantId: ORG,
      correlationId: CORRELATION_ID,
      payload: {},
    });

    expect(metricsService.recordMetric).toHaveBeenCalledOnce();
    const call = (metricsService.recordMetric as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      name: 'messages.sent',
      category: 'communication',
    });
  });

  it('calls recordMetric for member.created event', async () => {
    const metricsService = makeMetricsService();
    const kpiService = makeKPIService();
    const pool = makePool();
    const svc = new AnalyticsService(pool as never, metricsService, kpiService);

    await svc.handleEvent({
      type: 'member.created',
      tenantId: ORG,
      correlationId: CORRELATION_ID,
      payload: {},
    });

    expect(metricsService.recordMetric).toHaveBeenCalledOnce();
    const call = (metricsService.recordMetric as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toMatchObject({ name: 'members.created' });
  });

  it('does not call recordMetric for unknown event types', async () => {
    const metricsService = makeMetricsService();
    const kpiService = makeKPIService();
    const pool = makePool();
    const svc = new AnalyticsService(pool as never, metricsService, kpiService);

    await svc.handleEvent({
      type: 'unknown.event',
      tenantId: ORG,
      correlationId: CORRELATION_ID,
      payload: {},
    });

    expect(metricsService.recordMetric).not.toHaveBeenCalled();
  });

  it('sets tenant context for unknown events via pool query', async () => {
    const metricsService = makeMetricsService();
    const kpiService = makeKPIService();
    const pool = makePool();
    const svc = new AnalyticsService(pool as never, metricsService, kpiService);

    await svc.handleEvent({
      type: 'some.other.event',
      tenantId: ORG,
      correlationId: CORRELATION_ID,
      payload: {},
    });

    expect(pool.query).toHaveBeenCalledWith('SELECT set_config($1, $2, true)', [
      'app.current_tenant',
      ORG,
    ]);
  });
});
