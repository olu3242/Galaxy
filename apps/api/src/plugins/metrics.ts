/**
 * metrics.ts — Fastify plugin that exposes a /metrics endpoint.
 *
 * Uses a minimal hand-rolled registry (no external prom-client dependency)
 * that emits Prometheus text-format 0.0.4 output.
 *
 * Instrumented signals:
 *   - http_request_duration_seconds  histogram  (route × status × method)
 *   - active_workflow_runs           gauge       (organisational)
 *   - pending_approvals              gauge       (organisational)
 *   - agent_executions_total         counter     (agent_type × status)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Minimal Prometheus registry
// ---------------------------------------------------------------------------

interface Bucket {
  le: number;
  count: number;
}

const DURATION_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

// Counter — monotonically increasing value keyed by label string
const counters = new Map<string, number>();
// Gauges — current value keyed by label string
const gauges = new Map<string, number>();
// Histograms — map from label string to { buckets, sum, count }
const histograms = new Map<string, { buckets: Bucket[]; sum: number; count: number }>();

function counterKey(name: string, labels: Record<string, string>): string {
  const lStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return `${name}{${lStr}}`;
}

function incCounter(name: string, labels: Record<string, string>, by = 1): void {
  const key = counterKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + by);
}

function setGauge(name: string, labels: Record<string, string>, value: number): void {
  const key = counterKey(name, labels);
  gauges.set(key, value);
}

function observeHistogram(name: string, labels: Record<string, string>, value: number): void {
  const key = counterKey(name, labels);
  let entry = histograms.get(key);
  if (!entry) {
    entry = {
      buckets: DURATION_BUCKETS.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
    };
    histograms.set(key, entry);
  }
  entry.sum += value;
  entry.count += 1;
  for (const bucket of entry.buckets) {
    if (value <= bucket.le) {
      bucket.count += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Text-format serialisation
// ---------------------------------------------------------------------------

function renderMetrics(): string {
  const lines: string[] = [];

  // Counters
  if (counters.size > 0) {
    lines.push('# HELP agent_executions_total Total agent executions by type and status');
    lines.push('# TYPE agent_executions_total counter');
    for (const [key, value] of counters.entries()) {
      lines.push(`${key} ${String(value)}`);
    }
  }

  // Gauges
  if (gauges.size > 0) {
    lines.push('# HELP active_workflow_runs Currently active workflow runs');
    lines.push('# TYPE active_workflow_runs gauge');
    lines.push('# HELP pending_approvals Currently pending approval requests');
    lines.push('# TYPE pending_approvals gauge');
    for (const [key, value] of gauges.entries()) {
      lines.push(`${key} ${String(value)}`);
    }
  }

  // Histograms
  if (histograms.size > 0) {
    lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const [key, entry] of histograms.entries()) {
      // Extract label string from key, e.g. "http_request_duration_seconds{route="/health",..."
      const labelStr = key.slice(key.indexOf('{'));
      const baseName = key.slice(0, key.indexOf('{'));
      // Strip closing } and re-open for extra label
      const innerLabels = labelStr.slice(1, -1);
      for (const bucket of entry.buckets) {
        const bucketLabel = innerLabels
          ? `{${innerLabels},le="${String(bucket.le)}"}`
          : `{le="${String(bucket.le)}"}`;
        lines.push(`${baseName}_bucket${bucketLabel} ${String(bucket.count)}`);
      }
      const infLabel = innerLabels ? `{${innerLabels},le="+Inf"}` : `{le="+Inf"}`;
      lines.push(`${baseName}_bucket${infLabel} ${String(entry.count)}`);
      const sumLabel = innerLabels ? `{${innerLabels}}` : '';
      lines.push(`${baseName}_sum${sumLabel} ${String(entry.sum)}`);
      lines.push(`${baseName}_count${sumLabel} ${String(entry.count)}`);
    }
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public helpers — call these from route handlers / workers
// ---------------------------------------------------------------------------

/**
 * Record an agent execution outcome.
 * @param agentType  - e.g. 'executive_copilot'
 * @param status     - 'success' | 'failure'
 */
export function recordAgentExecution(agentType: string, status: 'success' | 'failure'): void {
  incCounter('agent_executions_total', { agent_type: agentType, status });
}

/**
 * Update the active-workflow-runs gauge for an organization.
 */
export function setActiveWorkflowRuns(organizationId: string, count: number): void {
  setGauge('active_workflow_runs', { organization_id: organizationId }, count);
}

/**
 * Update the pending-approvals gauge for an organization.
 */
export function setPendingApprovals(organizationId: string, count: number): void {
  setGauge('pending_approvals', { organization_id: organizationId }, count);
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

export function registerMetrics(app: FastifyInstance): void {
  // Instrument every reply with duration histogram
  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const durationMs = reply.elapsedTime;
    const durationSec = durationMs / 1000;
    observeHistogram(
      'http_request_duration_seconds',
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        status_code: String(reply.statusCode),
      },
      durationSec,
    );
    done();
  });

  // Expose /metrics endpoint — exempt from auth middleware
  app.get(
    '/metrics',
    {
      config: { skipAuth: true },
    },
    async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(renderMetrics());
    },
  );
}
