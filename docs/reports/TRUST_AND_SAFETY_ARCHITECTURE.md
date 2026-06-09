# Trust and Safety Architecture

## Overview

Galaxy Trust & Safety layer monitors, detects, and mitigates threats in real time across all tenant operations.

## Components

### ThreatDetectionService

- Records threat events with type, severity, source, and content
- Status lifecycle: `detected → investigating → confirmed → blocked | dismissed`
- Stores structured indicators for downstream analysis

### TrustEngine

- Computes composite trust scores per tenant
- Aggregates: threat ratio, blocked rate, open threat count
- Score threshold: ≥ 0.95 required for auto-execute confidence

## Threat Types

| Type                   | Description                            |
| ---------------------- | -------------------------------------- |
| `injection`            | Prompt or SQL injection attempts       |
| `unauthorized_access`  | Cross-tenant access attempts           |
| `data_exfiltration`    | Abnormal data export patterns          |
| `privilege_escalation` | Role elevation outside RBAC            |
| `replay_attack`        | Duplicated request signatures          |
| `rate_abuse`           | Excessive API calls from single source |
| `tenant_bypass`        | Attempts to bypass RLS policies        |

## Security Controls

- HMAC-SHA256 verified on all WhatsApp webhooks
- Timing-safe comparison for all token checks
- PII fields redacted from all log entries
- Immutable audit log (INSERT-only RLS)
