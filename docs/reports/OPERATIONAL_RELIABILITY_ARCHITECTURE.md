# Operational Reliability Architecture

## Overview

Galaxy Reliability OS is a 9-workstream framework ensuring high-availability, trust, and continuous improvement across all tenant operations.

## Workstreams

| #   | Workstream             | Service                                                 | DB Tables                                        |
| --- | ---------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| A   | Happy Path Registry    | `HappyPathService`                                      | `happy_path_templates`, `happy_path_simulations` |
| B   | Unhappy Path Registry  | `FailureRegistryService`, `FailureClassificationEngine` | `failure_records`, `failure_recovery_rules`      |
| C   | Confidence Engine      | `ConfidenceEngine`                                      | `confidence_scores`, `confidence_thresholds`     |
| D   | Trust & Safety         | `ThreatDetectionService`, `TrustEngine`                 | `threat_events`, `trust_scores`                  |
| E   | Escalation Framework   | `EscalationService`                                     | `escalation_records`, `delegation_records`       |
| F   | Recovery Engine        | `RecoveryEngine`                                        | `retry_records`, `retry_policies`                |
| G   | Governance Enforcement | `GovernanceEnforcementService`                          | `governance_approval_requests`                   |
| H   | Simulation Lab         | `SimulationEngine`                                      | `simulation_runs`, `simulation_reports`          |
| I   | Reliability Scoring    | `ReliabilityScoreService`                               | `reliability_reports`                            |

## Key Principles

- All tables use Row-Level Security with `app.current_tenant` context
- All state changes are async via BullMQ workers
- No direct SQL string interpolation — parameterized queries only
- All scores normalized 0–1; targets defined per metric

## API Surface

Routes are mounted at `/api/v1/reliability/*` via `reliabilityRoutes`.
