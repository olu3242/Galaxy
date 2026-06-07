# Galaxy Loop OS™

> **Run Your Organization From WhatsApp.**

Galaxy is a self-improving Organization Operating System (Org OS). Organizations submit workflows, approvals, and reports through WhatsApp. Galaxy governs, audits, and continuously improves every operation via the Loop Engine™.

---

## Status

| Layer                                  | Status                    |
| -------------------------------------- | ------------------------- |
| Repository Foundation                  | ✅ Sprint 0 — In Progress |
| Core Infrastructure                    | 🔲 Sprint 1               |
| Identity + Communication OS            | 🔲 Sprint 1               |
| Workflow + Loop OS (Verification)      | 🔲 Sprint 2               |
| Governance + Analytics OS              | 🔲 Sprint 2–3             |
| Agent OS                               | 🔲 V1                     |
| Full Loop OS (Learning + Optimization) | 🔲 V1                     |

---

## Repository Structure

```
galaxy/
├── apps/
│   ├── api/          Fastify REST + WebSocket API
│   ├── web/          Next.js 14 Mission Control dashboard
│   └── worker/       BullMQ background job workers
├── packages/
│   ├── types/        Shared TypeScript types and interfaces
│   ├── config/       Shared configuration loaders
│   └── utils/        Shared utility functions
├── docs/
│   ├── architecture/ Architecture Decision Records (ADRs)
│   ├── security/     Security policy, threat model, secrets management
│   ├── engineering/  Contributing guide, branch strategy, code review
│   └── product/      PRD, architecture doc, OS structure, automation strategy
├── infrastructure/
│   ├── docker/       Local development Docker Compose
│   └── scripts/      Setup and utility scripts
└── .github/
    └── workflows/    CI/CD GitHub Actions pipelines
```

---

## Quick Start

**Prerequisites:** Node.js 20+, pnpm 9+, Docker

```bash
# 1. Clone and install
git clone https://github.com/olu3242/Galaxy.git
cd Galaxy
pnpm install

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your local values

# 3. Start local infrastructure
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# 4. Run database migrations
pnpm --filter @galaxy/api db:migrate

# 5. Start development servers
pnpm dev
```

---

## Key Commands

```bash
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm typecheck    # TypeScript type-check
pnpm lint         # ESLint
pnpm format       # Prettier
```

---

## Documentation

- **[Product Requirements](docs/product/PRD.md)** — What Galaxy is and what it does
- **[Architecture](docs/product/ARCHITECTURE.md)** — Technical system architecture
- **[OS Module Reference](docs/product/OS_STRUCTURE.md)** — All 9 OS modules
- **[Automation Strategy](docs/product/AUTOMATION_STRATEGY.md)** — 4-tier automation framework
- **[Architecture Decisions](docs/architecture/)** — ADR log
- **[Security Policy](docs/security/SECURITY.md)** — Security requirements and reporting
- **[Contributing](docs/engineering/CONTRIBUTING.md)** — How to contribute
- **[Roadmap](ROADMAP.md)** — Phased delivery plan
- **[Sprint 0](SPRINT_0.md)** — Current sprint plan

---

## Architecture Overview

```
WhatsApp ──┐
Web App ───┼──► API Gateway ──► Runtime Kernel ──► OS Modules ──► Data Layer
Mobile ────┘     (Fastify)       (BullMQ Workers)   (9 modules)   (PostgreSQL
                                                                    + Redis)
                      │
                      ▼
                 Event Fabric ──► Loop Engine™ (self-improving)
```

---

## Security

See [SECURITY.md](docs/security/SECURITY.md) for the security policy and vulnerability reporting process.

---

## License

Proprietary — All rights reserved. © Galaxy Loop OS™
